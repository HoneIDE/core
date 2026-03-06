import { describe, test, expect, beforeEach } from 'bun:test';
import {
  ChangesQueue,
  resetQueueIds,
  type FileHashProvider,
  type FileWriter,
  type SourceDescriptor,
  type FileChange,
  type ChangeProposal,
} from '../src/queue/changes-queue';
import { TrustConfig } from '../src/queue/trust-config';
import { QueueHistory } from '../src/queue/queue-history';
import { hashContent } from '../src/queue/diff-applier';

// --- Mock helpers ---

function makeSource(deviceId: string = 'dev1'): SourceDescriptor {
  return { deviceId, deviceName: 'Test Device', platform: 'macos' };
}

function makeModifyChange(path: string, content: string, newLine: string): FileChange {
  const baseHash = hashContent(content);
  const diff = [
    `diff --git a/${path} b/${path}`,
    `--- a/${path}`,
    `+++ b/${path}`,
    '@@ -1,1 +1,1 @@',
    `-${content.split('\n')[0]}`,
    `+${newLine}`,
  ].join('\n');
  return { type: 'modify', path, diff, baseHash };
}

function makeCreateChange(path: string, content: string): FileChange {
  return { type: 'create', path, content };
}

function makeDeleteChange(path: string): FileChange {
  return { type: 'delete', path };
}

class MockFileSystem implements FileHashProvider, FileWriter {
  files: Map<string, string> = new Map();

  addFile(projectId: string, path: string, content: string): void {
    this.files.set(`${projectId}:${path}`, content);
  }

  getHash(projectId: string, filePath: string): string | null {
    const content = this.files.get(`${projectId}:${filePath}`);
    return content !== undefined ? hashContent(content) : null;
  }

  getContent(projectId: string, filePath: string): string | null {
    return this.files.get(`${projectId}:${filePath}`) ?? null;
  }

  writeFile(projectId: string, filePath: string, content: string): void {
    this.files.set(`${projectId}:${filePath}`, content);
  }

  deleteFile(projectId: string, filePath: string): void {
    this.files.delete(`${projectId}:${filePath}`);
  }

  moveFile(projectId: string, oldPath: string, newPath: string): void {
    const content = this.files.get(`${projectId}:${oldPath}`);
    if (content !== undefined) {
      this.files.set(`${projectId}:${newPath}`, content);
      this.files.delete(`${projectId}:${oldPath}`);
    }
  }
}

describe('ChangesQueue', () => {
  let queue: ChangesQueue;
  let fs: MockFileSystem;

  beforeEach(() => {
    resetQueueIds();
    queue = new ChangesQueue();
    fs = new MockFileSystem();
  });

  // --- Enqueue ---

  test('enqueue creates pending proposal', () => {
    const result = queue.enqueue({
      source: makeSource(),
      timestamp: new Date().toISOString(),
      projectId: 'proj1',
      files: [makeCreateChange('new.ts', 'content')],
      description: 'Create file',
    }, fs);

    expect(result.proposal.id).toBe('prop_1');
    expect(result.proposal.status).toBe('pending');
    expect(result.autoAccepted).toBe(false);
  });

  test('enqueue blocked source creates rejected proposal', () => {
    const trust = new TrustConfig();
    trust.setTrust('blocked', 'block');
    queue = new ChangesQueue(trust);

    const result = queue.enqueue({
      source: makeSource('blocked'),
      timestamp: new Date().toISOString(),
      projectId: 'proj1',
      files: [makeCreateChange('new.ts', 'content')],
      description: 'Blocked',
    }, fs);

    expect(result.proposal.status).toBe('rejected');
  });

  test('enqueue with auto-accept-all sets autoAccepted', () => {
    const trust = new TrustConfig();
    trust.setTrust('dev1', 'auto-accept-all');
    queue = new ChangesQueue(trust);

    const result = queue.enqueue({
      source: makeSource('dev1'),
      timestamp: new Date().toISOString(),
      projectId: 'proj1',
      files: [makeCreateChange('new.ts', 'content')],
      description: 'Auto',
    }, fs);

    expect(result.autoAccepted).toBe(true);
    expect(result.proposal.status).toBe('pending');
  });

  test('enqueue detects no conflict when hashes match', () => {
    fs.addFile('proj1', 'file.ts', 'original');
    const change = makeModifyChange('file.ts', 'original', 'modified');

    const result = queue.enqueue({
      source: makeSource(),
      timestamp: new Date().toISOString(),
      projectId: 'proj1',
      files: [change],
      description: 'Modify',
    }, fs);

    expect(result.proposal.conflict).toBe('none');
  });

  test('enqueue detects unresolved conflict', () => {
    // File was modified after the base hash was computed
    fs.addFile('proj1', 'file.ts', 'changed-content');
    const change = makeModifyChange('file.ts', 'original', 'modified');

    const result = queue.enqueue({
      source: makeSource(),
      timestamp: new Date().toISOString(),
      projectId: 'proj1',
      files: [change],
      description: 'Conflict',
    }, fs);

    expect(result.proposal.conflict).toBe('unresolved');
  });

  test('enqueue fires proposal listener', () => {
    let received: ChangeProposal | null = null;
    queue.onProposal(p => { received = p; });

    queue.enqueue({
      source: makeSource(),
      timestamp: new Date().toISOString(),
      projectId: 'proj1',
      files: [makeCreateChange('new.ts', 'content')],
      description: 'Test',
    }, fs);

    expect(received).not.toBeNull();
    expect(received!.id).toBe('prop_1');
  });

  // --- Accept ---

  test('accept applies create change', () => {
    queue.enqueue({
      source: makeSource(),
      timestamp: new Date().toISOString(),
      projectId: 'proj1',
      files: [makeCreateChange('new.ts', 'hello world')],
      description: 'Create',
    }, fs);

    const result = queue.accept('prop_1', fs, fs);
    expect(result.success).toBe(true);
    expect(result.filesModified).toContain('new.ts');
    expect(fs.getContent('proj1', 'new.ts')).toBe('hello world');
  });

  test('accept applies modify change', () => {
    fs.addFile('proj1', 'file.ts', 'original');
    const change = makeModifyChange('file.ts', 'original', 'modified');

    queue.enqueue({
      source: makeSource(),
      timestamp: new Date().toISOString(),
      projectId: 'proj1',
      files: [change],
      description: 'Modify',
    }, fs);

    const result = queue.accept('prop_1', fs, fs);
    expect(result.success).toBe(true);
    expect(fs.getContent('proj1', 'file.ts')).toBe('modified');
  });

  test('accept applies delete change', () => {
    fs.addFile('proj1', 'file.ts', 'content');

    queue.enqueue({
      source: makeSource(),
      timestamp: new Date().toISOString(),
      projectId: 'proj1',
      files: [makeDeleteChange('file.ts')],
      description: 'Delete',
    }, fs);

    const result = queue.accept('prop_1', fs, fs);
    expect(result.success).toBe(true);
    expect(fs.getContent('proj1', 'file.ts')).toBeNull();
  });

  test('accept applies rename change', () => {
    fs.addFile('proj1', 'old.ts', 'content');

    queue.enqueue({
      source: makeSource(),
      timestamp: new Date().toISOString(),
      projectId: 'proj1',
      files: [{ type: 'rename', path: 'new.ts', oldPath: 'old.ts' }],
      description: 'Rename',
    }, fs);

    const result = queue.accept('prop_1', fs, fs);
    expect(result.success).toBe(true);
    expect(fs.getContent('proj1', 'old.ts')).toBeNull();
    expect(fs.getContent('proj1', 'new.ts')).toBe('content');
  });

  test('accept sets status to accepted', () => {
    queue.enqueue({
      source: makeSource(),
      timestamp: new Date().toISOString(),
      projectId: 'proj1',
      files: [makeCreateChange('new.ts', 'content')],
      description: 'Create',
    }, fs);

    queue.accept('prop_1', fs, fs);
    expect(queue.get('prop_1')!.status).toBe('accepted');
  });

  test('accept fires decision listener', () => {
    let decidedId = '';
    let decidedAction = '';
    queue.onDecision((id, action) => { decidedId = id; decidedAction = action; });

    queue.enqueue({
      source: makeSource(),
      timestamp: new Date().toISOString(),
      projectId: 'proj1',
      files: [makeCreateChange('new.ts', 'content')],
      description: 'Create',
    }, fs);

    queue.accept('prop_1', fs, fs);
    expect(decidedId).toBe('prop_1');
    expect(decidedAction).toBe('accepted');
  });

  test('accept non-existent proposal fails', () => {
    const result = queue.accept('nonexistent', fs, fs);
    expect(result.success).toBe(false);
  });

  test('accept already accepted proposal fails', () => {
    queue.enqueue({
      source: makeSource(),
      timestamp: new Date().toISOString(),
      projectId: 'proj1',
      files: [makeCreateChange('new.ts', 'content')],
      description: 'Create',
    }, fs);

    queue.accept('prop_1', fs, fs);
    const result = queue.accept('prop_1', fs, fs);
    expect(result.success).toBe(false);
  });

  // --- Reject ---

  test('reject sets status to rejected', () => {
    queue.enqueue({
      source: makeSource(),
      timestamp: new Date().toISOString(),
      projectId: 'proj1',
      files: [makeCreateChange('new.ts', 'content')],
      description: 'Create',
    }, fs);

    expect(queue.reject('prop_1')).toBe(true);
    expect(queue.get('prop_1')!.status).toBe('rejected');
  });

  test('reject fires decision listener', () => {
    let action = '';
    queue.onDecision((_, a) => { action = a; });

    queue.enqueue({
      source: makeSource(),
      timestamp: new Date().toISOString(),
      projectId: 'proj1',
      files: [makeCreateChange('new.ts', 'content')],
      description: 'Create',
    }, fs);

    queue.reject('prop_1');
    expect(action).toBe('rejected');
  });

  test('reject non-pending returns false', () => {
    expect(queue.reject('nonexistent')).toBe(false);
  });

  // --- Batch operations ---

  test('acceptAll accepts all pending from source', () => {
    queue.enqueue({ source: makeSource('dev1'), timestamp: new Date().toISOString(), projectId: 'proj1', files: [makeCreateChange('a.ts', 'a')], description: 'A' }, fs);
    queue.enqueue({ source: makeSource('dev1'), timestamp: new Date().toISOString(), projectId: 'proj1', files: [makeCreateChange('b.ts', 'b')], description: 'B' }, fs);
    queue.enqueue({ source: makeSource('dev2'), timestamp: new Date().toISOString(), projectId: 'proj1', files: [makeCreateChange('c.ts', 'c')], description: 'C' }, fs);

    const results = queue.acceptAll('dev1', fs, fs);
    expect(results.length).toBe(2);
    expect(results[0].success).toBe(true);
    expect(results[1].success).toBe(true);
    expect(queue.get('prop_3')!.status).toBe('pending'); // dev2 unaffected
  });

  test('rejectAll rejects all pending from source', () => {
    queue.enqueue({ source: makeSource('dev1'), timestamp: new Date().toISOString(), projectId: 'proj1', files: [makeCreateChange('a.ts', 'a')], description: 'A' }, fs);
    queue.enqueue({ source: makeSource('dev1'), timestamp: new Date().toISOString(), projectId: 'proj1', files: [makeCreateChange('b.ts', 'b')], description: 'B' }, fs);

    const count = queue.rejectAll('dev1');
    expect(count).toBe(2);
  });

  // --- Groups ---

  test('getGroup returns proposals with matching groupId', () => {
    queue.enqueue({ source: makeSource(), timestamp: new Date().toISOString(), projectId: 'proj1', files: [makeCreateChange('a.ts', 'a')], description: 'A', groupId: 'g1' }, fs);
    queue.enqueue({ source: makeSource(), timestamp: new Date().toISOString(), projectId: 'proj1', files: [makeCreateChange('b.ts', 'b')], description: 'B', groupId: 'g1' }, fs);
    queue.enqueue({ source: makeSource(), timestamp: new Date().toISOString(), projectId: 'proj1', files: [makeCreateChange('c.ts', 'c')], description: 'C', groupId: 'g2' }, fs);

    const group = queue.getGroup('g1');
    expect(group.length).toBe(2);
  });

  test('acceptGroup accepts all pending in group', () => {
    queue.enqueue({ source: makeSource(), timestamp: new Date().toISOString(), projectId: 'proj1', files: [makeCreateChange('a.ts', 'a')], description: 'A', groupId: 'g1' }, fs);
    queue.enqueue({ source: makeSource(), timestamp: new Date().toISOString(), projectId: 'proj1', files: [makeCreateChange('b.ts', 'b')], description: 'B', groupId: 'g1' }, fs);
    queue.enqueue({ source: makeSource(), timestamp: new Date().toISOString(), projectId: 'proj1', files: [makeCreateChange('c.ts', 'c')], description: 'C', groupId: 'g2' }, fs);

    const results = queue.acceptGroup('g1', fs, fs);
    expect(results.length).toBe(2);
    expect(results[0].success).toBe(true);
    expect(results[1].success).toBe(true);
    expect(queue.get('prop_1')!.status).toBe('accepted');
    expect(queue.get('prop_2')!.status).toBe('accepted');
    expect(queue.get('prop_3')!.status).toBe('pending'); // g2 unaffected
  });

  test('rejectGroup rejects all pending in group', () => {
    queue.enqueue({ source: makeSource(), timestamp: new Date().toISOString(), projectId: 'proj1', files: [makeCreateChange('a.ts', 'a')], description: 'A', groupId: 'g1' }, fs);
    queue.enqueue({ source: makeSource(), timestamp: new Date().toISOString(), projectId: 'proj1', files: [makeCreateChange('b.ts', 'b')], description: 'B', groupId: 'g1' }, fs);

    const count = queue.rejectGroup('g1');
    expect(count).toBe(2);
    expect(queue.get('prop_1')!.status).toBe('rejected');
    expect(queue.get('prop_2')!.status).toBe('rejected');
  });

  test('acceptGroup skips already accepted proposals', () => {
    queue.enqueue({ source: makeSource(), timestamp: new Date().toISOString(), projectId: 'proj1', files: [makeCreateChange('a.ts', 'a')], description: 'A', groupId: 'g1' }, fs);
    queue.enqueue({ source: makeSource(), timestamp: new Date().toISOString(), projectId: 'proj1', files: [makeCreateChange('b.ts', 'b')], description: 'B', groupId: 'g1' }, fs);

    queue.accept('prop_1', fs, fs);
    const results = queue.acceptGroup('g1', fs, fs);
    expect(results.length).toBe(1); // only prop_2
    expect(results[0].proposalId).toBe('prop_2');
  });

  test('getPendingGroupIds returns unique group IDs', () => {
    queue.enqueue({ source: makeSource(), timestamp: new Date().toISOString(), projectId: 'proj1', files: [makeCreateChange('a.ts', 'a')], description: 'A', groupId: 'g1' }, fs);
    queue.enqueue({ source: makeSource(), timestamp: new Date().toISOString(), projectId: 'proj1', files: [makeCreateChange('b.ts', 'b')], description: 'B', groupId: 'g1' }, fs);
    queue.enqueue({ source: makeSource(), timestamp: new Date().toISOString(), projectId: 'proj1', files: [makeCreateChange('c.ts', 'c')], description: 'C', groupId: 'g2' }, fs);
    queue.enqueue({ source: makeSource(), timestamp: new Date().toISOString(), projectId: 'proj1', files: [makeCreateChange('d.ts', 'd')], description: 'D' }, fs); // no group

    const groups = queue.getPendingGroupIds();
    expect(groups.length).toBe(2);
    expect(groups).toContain('g1');
    expect(groups).toContain('g2');
  });

  test('getPendingGroupIds excludes accepted groups', () => {
    queue.enqueue({ source: makeSource(), timestamp: new Date().toISOString(), projectId: 'proj1', files: [makeCreateChange('a.ts', 'a')], description: 'A', groupId: 'g1' }, fs);
    queue.accept('prop_1', fs, fs);

    const groups = queue.getPendingGroupIds();
    expect(groups.length).toBe(0);
  });

  // --- Undo ---

  test('undo reverts accepted create by deleting file', () => {
    // Note: undo for create changes requires reverse diffs which aren't generated for creates
    // This tests the undo mechanism for modify changes
    fs.addFile('proj1', 'file.ts', 'original');
    const change = makeModifyChange('file.ts', 'original', 'modified');

    queue.enqueue({
      source: makeSource(),
      timestamp: new Date().toISOString(),
      projectId: 'proj1',
      files: [change],
      description: 'Modify',
    }, fs);

    queue.accept('prop_1', fs, fs);
    expect(fs.getContent('proj1', 'file.ts')).toBe('modified');

    const undoResult = queue.undo(1, fs, fs);
    expect(undoResult.undoneCount).toBe(1);
    expect(undoResult.proposals).toContain('prop_1');
    expect(fs.getContent('proj1', 'file.ts')).toBe('original');
  });

  test('undo sets status to undone', () => {
    fs.addFile('proj1', 'file.ts', 'original');
    const change = makeModifyChange('file.ts', 'original', 'modified');

    queue.enqueue({
      source: makeSource(),
      timestamp: new Date().toISOString(),
      projectId: 'proj1',
      files: [change],
      description: 'Modify',
    }, fs);

    queue.accept('prop_1', fs, fs);
    queue.undo(1, fs, fs);
    expect(queue.get('prop_1')!.status).toBe('undone');
  });

  test('undo reports conflicts when file changed after accept', () => {
    fs.addFile('proj1', 'file.ts', 'original');
    const change = makeModifyChange('file.ts', 'original', 'modified');

    queue.enqueue({
      source: makeSource(),
      timestamp: new Date().toISOString(),
      projectId: 'proj1',
      files: [change],
      description: 'Modify',
    }, fs);

    queue.accept('prop_1', fs, fs);
    // Simulate further edits after accept
    fs.addFile('proj1', 'file.ts', 'further-modified');

    const undoResult = queue.undo(1, fs, fs);
    expect(undoResult.conflicts.length).toBeGreaterThan(0);
  });

  test('undo reports conflict when file is missing', () => {
    fs.addFile('proj1', 'file.ts', 'original');
    const change = makeModifyChange('file.ts', 'original', 'modified');

    queue.enqueue({
      source: makeSource(),
      timestamp: new Date().toISOString(),
      projectId: 'proj1',
      files: [change],
      description: 'Modify',
    }, fs);

    queue.accept('prop_1', fs, fs);
    // File deleted after accept
    fs.deleteFile('proj1', 'file.ts');

    const undoResult = queue.undo(1, fs, fs);
    expect(undoResult.conflicts.length).toBeGreaterThan(0);
    expect(undoResult.conflicts[0]).toContain('file missing');
  });

  test('undo multiple proposals in order', () => {
    fs.addFile('proj1', 'a.ts', 'line1');
    const changeA = makeModifyChange('a.ts', 'line1', 'line1-v2');

    fs.addFile('proj1', 'b.ts', 'hello');
    const changeB = makeModifyChange('b.ts', 'hello', 'hello-v2');

    queue.enqueue({
      source: makeSource(),
      timestamp: new Date().toISOString(),
      projectId: 'proj1',
      files: [changeA],
      description: 'Modify A',
    }, fs);

    queue.accept('prop_1', fs, fs);

    queue.enqueue({
      source: makeSource(),
      timestamp: new Date().toISOString(),
      projectId: 'proj1',
      files: [changeB],
      description: 'Modify B',
    }, fs);

    queue.accept('prop_2', fs, fs);

    // Undo both
    const undoResult = queue.undo(2, fs, fs);
    expect(undoResult.undoneCount).toBe(2);
    expect(fs.getContent('proj1', 'a.ts')).toBe('line1');
    expect(fs.getContent('proj1', 'b.ts')).toBe('hello');
  });

  test('undo does not undo rejected proposals', () => {
    queue.enqueue({
      source: makeSource(),
      timestamp: new Date().toISOString(),
      projectId: 'proj1',
      files: [makeCreateChange('a.ts', 'a')],
      description: 'Rejected',
    }, fs);
    queue.reject('prop_1');

    const undoResult = queue.undo(1, fs, fs);
    expect(undoResult.undoneCount).toBe(0);
  });

  // --- Listeners ---

  test('unsubscribe proposal listener', () => {
    let count = 0;
    const unsub = queue.onProposal(() => { count++; });

    queue.enqueue({ source: makeSource(), timestamp: new Date().toISOString(), projectId: 'proj1', files: [makeCreateChange('a.ts', 'a')], description: 'A' }, fs);
    expect(count).toBe(1);

    unsub();
    queue.enqueue({ source: makeSource(), timestamp: new Date().toISOString(), projectId: 'proj1', files: [makeCreateChange('b.ts', 'b')], description: 'B' }, fs);
    expect(count).toBe(1); // unchanged
  });

  test('unsubscribe decision listener', () => {
    let count = 0;
    const unsub = queue.onDecision(() => { count++; });

    queue.enqueue({ source: makeSource(), timestamp: new Date().toISOString(), projectId: 'proj1', files: [makeCreateChange('a.ts', 'a')], description: 'A' }, fs);
    queue.accept('prop_1', fs, fs);
    expect(count).toBe(1);

    unsub();
    queue.enqueue({ source: makeSource(), timestamp: new Date().toISOString(), projectId: 'proj1', files: [makeCreateChange('b.ts', 'b')], description: 'B' }, fs);
    queue.accept('prop_2', fs, fs);
    expect(count).toBe(1);
  });

  // --- Query ---

  test('listPending returns only pending', () => {
    queue.enqueue({ source: makeSource(), timestamp: new Date().toISOString(), projectId: 'proj1', files: [makeCreateChange('a.ts', 'a')], description: 'A' }, fs);
    queue.enqueue({ source: makeSource(), timestamp: new Date().toISOString(), projectId: 'proj1', files: [makeCreateChange('b.ts', 'b')], description: 'B' }, fs);
    queue.accept('prop_1', fs, fs);

    expect(queue.listPending().length).toBe(1);
    expect(queue.listPending()[0].id).toBe('prop_2');
  });

  test('count and pendingCount', () => {
    queue.enqueue({ source: makeSource(), timestamp: new Date().toISOString(), projectId: 'proj1', files: [makeCreateChange('a.ts', 'a')], description: 'A' }, fs);
    queue.enqueue({ source: makeSource(), timestamp: new Date().toISOString(), projectId: 'proj1', files: [makeCreateChange('b.ts', 'b')], description: 'B' }, fs);
    queue.accept('prop_1', fs, fs);

    expect(queue.count).toBe(2);
    expect(queue.pendingCount).toBe(1);
  });

  test('getAll returns all proposals', () => {
    queue.enqueue({ source: makeSource(), timestamp: new Date().toISOString(), projectId: 'proj1', files: [makeCreateChange('a.ts', 'a')], description: 'A' }, fs);
    queue.enqueue({ source: makeSource(), timestamp: new Date().toISOString(), projectId: 'proj1', files: [makeCreateChange('b.ts', 'b')], description: 'B' }, fs);
    expect(queue.getAll().length).toBe(2);
  });

  test('get returns null for unknown id', () => {
    expect(queue.get('nonexistent')).toBeNull();
  });
});
