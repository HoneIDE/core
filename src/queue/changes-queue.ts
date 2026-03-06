/**
 * Changes Queue — review inbox for incoming modifications.
 * Follows ChatModel pattern: array-backed, ID lookup, listener/event.
 */

import { applyPatch, reverseDiff, hashContent } from './diff-applier';
import { detectConflict, type ConflictResult } from './conflict-detector';
import { TrustConfig, type TrustLevel } from './trust-config';
import { QueueHistory, type HistoryEntry } from './queue-history';

// --- Types ---

export type ProposalStatus = 'pending' | 'accepted' | 'rejected' | 'undone';
export type QueueFileChangeType = 'modify' | 'create' | 'delete' | 'rename';
export type ConflictState = 'none' | 'resolved' | 'unresolved';

export interface SourceDescriptor {
  deviceId: string;
  deviceName: string;
  platform: string;
}

export interface FileChange {
  type: QueueFileChangeType;
  path: string;
  oldPath?: string;
  diff?: string;
  content?: string;
  baseHash?: string;
}

export interface ChangeProposal {
  id: string;
  source: SourceDescriptor;
  timestamp: string;
  projectId: string;
  files: FileChange[];
  description: string;
  context?: Record<string, unknown>;
  status: ProposalStatus;
  groupId?: string;
  conflict: ConflictState;
}

export interface EnqueueResult {
  proposal: ChangeProposal;
  autoAccepted: boolean;
}

export interface AcceptResult {
  proposalId: string;
  success: boolean;
  filesModified: string[];
  error?: string;
}

export interface UndoResult {
  undoneCount: number;
  proposals: string[];
  conflicts: string[];
}

// --- Injected interfaces ---

export interface FileHashProvider {
  getHash(projectId: string, filePath: string): string | null;
  getContent(projectId: string, filePath: string): string | null;
}

export interface FileWriter {
  writeFile(projectId: string, filePath: string, content: string): void;
  deleteFile(projectId: string, filePath: string): void;
  moveFile(projectId: string, oldPath: string, newPath: string): void;
}

// --- Listeners ---

export type ProposalListener = (proposal: ChangeProposal) => void;
export type DecisionListener = (proposalId: string, action: 'accepted' | 'rejected' | 'undone') => void;

// --- ID generation ---

let nextProposalId = 1;

function generateProposalId(): string {
  return 'prop_' + (nextProposalId++);
}

export function resetQueueIds(): void {
  nextProposalId = 1;
}

// --- Main class ---

export class ChangesQueue {
  private proposals: ChangeProposal[] = [];
  private proposalListeners: ProposalListener[] = [];
  private decisionListeners: DecisionListener[] = [];
  readonly trust: TrustConfig;
  readonly history: QueueHistory;

  constructor(trust?: TrustConfig, history?: QueueHistory) {
    this.trust = trust ?? new TrustConfig();
    this.history = history ?? new QueueHistory();
  }

  /** Enqueue a change proposal. Runs conflict detection and trust check. */
  enqueue(proposal: Omit<ChangeProposal, 'id' | 'status' | 'conflict'>, hashProvider: FileHashProvider): EnqueueResult {
    const sourceId = proposal.source.deviceId;

    // Check if source is blocked
    if (this.trust.isBlocked(sourceId)) {
      const blocked: ChangeProposal = {
        ...proposal,
        id: generateProposalId(),
        status: 'rejected',
        conflict: 'none',
      };
      return { proposal: blocked, autoAccepted: false };
    }

    // Run conflict detection for each file
    let overallConflict: ConflictState = 'none';
    for (let i = 0; i < proposal.files.length; i++) {
      const fc = proposal.files[i];
      if (fc.type === 'modify' && fc.diff) {
        const currentHash = hashProvider.getHash(proposal.projectId, fc.path);
        const currentContent = hashProvider.getContent(proposal.projectId, fc.path);
        const result = detectConflict(currentContent, currentHash, fc.baseHash, fc.diff);
        if (result.state === 'unresolved') {
          overallConflict = 'unresolved';
          break;
        }
        if (result.state === 'resolved') {
          overallConflict = 'resolved';
        }
      }
    }

    const full: ChangeProposal = {
      ...proposal,
      id: generateProposalId(),
      status: 'pending',
      conflict: overallConflict,
    };

    // Check for auto-accept
    const isClean = overallConflict === 'none';
    const autoAccept = this.trust.shouldAutoAccept(sourceId, isClean);

    if (autoAccept && overallConflict !== 'unresolved') {
      full.status = 'pending'; // will be set to accepted in accept()
      this.proposals.push(full);
      this.emitProposal(full);
      // Note: auto-accept doesn't call accept() because we need a FileWriter
      // The caller should detect autoAccepted and call accept()
      return { proposal: full, autoAccepted: true };
    }

    this.proposals.push(full);
    this.emitProposal(full);
    return { proposal: full, autoAccepted: false };
  }

  /** Accept a pending proposal and apply changes to the working tree. */
  accept(id: string, writer: FileWriter, hashProvider: FileHashProvider): AcceptResult {
    const proposal = this.get(id);
    if (!proposal || proposal.status !== 'pending') {
      return { proposalId: id, success: false, filesModified: [], error: 'Proposal not found or not pending' };
    }

    const filesModified: string[] = [];
    const reverseMap = new Map<string, string>();

    for (let i = 0; i < proposal.files.length; i++) {
      const fc = proposal.files[i];

      if (fc.type === 'modify' && fc.diff) {
        const content = hashProvider.getContent(proposal.projectId, fc.path);
        if (content === null) {
          return { proposalId: id, success: false, filesModified, error: `File not found: ${fc.path}` };
        }

        const result = applyPatch(content, fc.diff);
        if (!result.success) {
          return { proposalId: id, success: false, filesModified, error: `Failed to apply patch to ${fc.path}: ${result.error}` };
        }

        writer.writeFile(proposal.projectId, fc.path, result.newContent);
        reverseMap.set(fc.path, reverseDiff(fc.diff));
        filesModified.push(fc.path);

      } else if (fc.type === 'create' && fc.content !== undefined) {
        writer.writeFile(proposal.projectId, fc.path, fc.content);
        filesModified.push(fc.path);

      } else if (fc.type === 'delete') {
        writer.deleteFile(proposal.projectId, fc.path);
        filesModified.push(fc.path);

      } else if (fc.type === 'rename' && fc.oldPath) {
        writer.moveFile(proposal.projectId, fc.oldPath, fc.path);
        filesModified.push(fc.path);
      }
    }

    proposal.status = 'accepted';
    this.history.record(id, 'accepted', reverseMap);
    this.emitDecision(id, 'accepted');

    return { proposalId: id, success: true, filesModified };
  }

  /** Reject a pending proposal. */
  reject(id: string): boolean {
    const proposal = this.get(id);
    if (!proposal || proposal.status !== 'pending') return false;

    proposal.status = 'rejected';
    this.history.record(id, 'rejected');
    this.emitDecision(id, 'rejected');
    return true;
  }

  /** Accept all pending proposals from a specific source. */
  acceptAll(sourceId: string, writer: FileWriter, hashProvider: FileHashProvider): AcceptResult[] {
    const results: AcceptResult[] = [];
    const pending = this.listPending().filter(p => p.source.deviceId === sourceId);
    for (let i = 0; i < pending.length; i++) {
      results.push(this.accept(pending[i].id, writer, hashProvider));
    }
    return results;
  }

  /** Reject all pending proposals from a specific source. */
  rejectAll(sourceId: string): number {
    const pending = this.listPending().filter(p => p.source.deviceId === sourceId);
    let count = 0;
    for (let i = 0; i < pending.length; i++) {
      if (this.reject(pending[i].id)) count++;
    }
    return count;
  }

  /** Undo the last N accepted proposals. */
  undo(count: number, writer: FileWriter, hashProvider: FileHashProvider): UndoResult {
    const undoable = this.history.getUndoable(count);
    let undoneCount = 0;
    const proposalIds: string[] = [];
    const conflicts: string[] = [];

    for (let i = 0; i < undoable.length; i++) {
      const entry = undoable[i];
      const proposal = this.get(entry.proposalId);
      if (!proposal || proposal.status !== 'accepted') continue;

      let hasConflict = false;

      // Apply reverse diffs
      const reverseDiffs = entry.reverseDiffs;
      const paths = Array.from(reverseDiffs.keys());
      for (let j = 0; j < paths.length; j++) {
        const path = paths[j];
        const revDiff = reverseDiffs.get(path)!;
        const content = hashProvider.getContent(proposal.projectId, path);
        if (content === null) {
          conflicts.push(`${entry.proposalId}:${path} (file missing)`);
          hasConflict = true;
          continue;
        }

        const result = applyPatch(content, revDiff);
        if (!result.success) {
          conflicts.push(`${entry.proposalId}:${path} (${result.error})`);
          hasConflict = true;
          continue;
        }

        writer.writeFile(proposal.projectId, path, result.newContent);
      }

      if (!hasConflict) {
        proposal.status = 'undone';
        this.history.markUndone(entry.proposalId);
        this.emitDecision(entry.proposalId, 'undone');
        undoneCount++;
        proposalIds.push(entry.proposalId);
      }
    }

    return { undoneCount, proposals: proposalIds, conflicts };
  }

  /** List all pending proposals. */
  listPending(): ChangeProposal[] {
    const result: ChangeProposal[] = [];
    for (let i = 0; i < this.proposals.length; i++) {
      if (this.proposals[i].status === 'pending') {
        result.push(this.proposals[i]);
      }
    }
    return result;
  }

  /** Get a proposal by ID. */
  get(id: string): ChangeProposal | null {
    for (let i = 0; i < this.proposals.length; i++) {
      if (this.proposals[i].id === id) return this.proposals[i];
    }
    return null;
  }

  /** Get all proposals. */
  getAll(): ChangeProposal[] {
    return this.proposals.slice();
  }

  /** Get proposals by group ID. */
  getGroup(groupId: string): ChangeProposal[] {
    const result: ChangeProposal[] = [];
    for (let i = 0; i < this.proposals.length; i++) {
      if (this.proposals[i].groupId === groupId) {
        result.push(this.proposals[i]);
      }
    }
    return result;
  }

  /** Accept all pending proposals in a group. */
  acceptGroup(groupId: string, writer: FileWriter, hashProvider: FileHashProvider): AcceptResult[] {
    const group = this.getGroup(groupId);
    const results: AcceptResult[] = [];
    for (let i = 0; i < group.length; i++) {
      if (group[i].status === 'pending') {
        results.push(this.accept(group[i].id, writer, hashProvider));
      }
    }
    return results;
  }

  /** Reject all pending proposals in a group. */
  rejectGroup(groupId: string): number {
    const group = this.getGroup(groupId);
    let count = 0;
    for (let i = 0; i < group.length; i++) {
      if (group[i].status === 'pending') {
        if (this.reject(group[i].id)) count++;
      }
    }
    return count;
  }

  /** Get all unique pending group IDs. */
  getPendingGroupIds(): string[] {
    const seen: string[] = [];
    for (let i = 0; i < this.proposals.length; i++) {
      const p = this.proposals[i];
      if (p.status === 'pending' && p.groupId) {
        let found = false;
        for (let j = 0; j < seen.length; j++) {
          if (seen[j] === p.groupId) { found = true; break; }
        }
        if (!found) seen.push(p.groupId);
      }
    }
    return seen;
  }

  /** Subscribe to new proposals. Returns unsubscribe function. */
  onProposal(listener: ProposalListener): () => void {
    this.proposalListeners.push(listener);
    return () => {
      const idx = this.proposalListeners.indexOf(listener);
      if (idx >= 0) this.proposalListeners.splice(idx, 1);
    };
  }

  /** Subscribe to decisions (accept/reject/undo). Returns unsubscribe function. */
  onDecision(listener: DecisionListener): () => void {
    this.decisionListeners.push(listener);
    return () => {
      const idx = this.decisionListeners.indexOf(listener);
      if (idx >= 0) this.decisionListeners.splice(idx, 1);
    };
  }

  /** Total proposal count. */
  get count(): number {
    return this.proposals.length;
  }

  /** Pending proposal count. */
  get pendingCount(): number {
    let c = 0;
    for (let i = 0; i < this.proposals.length; i++) {
      if (this.proposals[i].status === 'pending') c++;
    }
    return c;
  }

  private emitProposal(proposal: ChangeProposal): void {
    for (let i = 0; i < this.proposalListeners.length; i++) {
      this.proposalListeners[i](proposal);
    }
  }

  private emitDecision(proposalId: string, action: 'accepted' | 'rejected' | 'undone'): void {
    for (let i = 0; i < this.decisionListeners.length; i++) {
      this.decisionListeners[i](proposalId, action);
    }
  }
}
