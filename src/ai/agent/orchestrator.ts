/**
 * Agent orchestrator — plan + execute loop.
 *
 * The orchestrator manages the lifecycle of an agent task:
 * 1. Receive user intent
 * 2. Build plan (via AI)
 * 3. Execute steps, calling tools and handling approvals
 * 4. Handle errors and retries
 */

import { AgentPlan } from './planner';
import { ActivityLog } from './activity-log';
import type { AgentToolDefinition } from './tools';
import { getToolByName } from './tools';

export type OrchestratorStatus = 'idle' | 'planning' | 'executing' | 'waiting_approval' | 'paused' | 'completed' | 'failed';

export interface ToolCallRequest {
  toolName: string;
  arguments: Record<string, unknown>;
  /** The plan step ID this belongs to */
  stepId?: number;
}

export interface ToolCallResult {
  toolName: string;
  success: boolean;
  output: string;
  durationMs: number;
}

export interface ApprovalRequest {
  id: number;
  toolName: string;
  arguments: Record<string, unknown>;
  description: string;
}

export interface OrchestratorConfig {
  /** Max iterations before stopping (default 50) */
  maxIterations: number;
  /** Max consecutive errors before stopping (default 3) */
  maxConsecutiveErrors: number;
  /** Auto-approve read-only tools (default true) */
  autoApproveReadOnly: boolean;
}

const DEFAULT_CONFIG: OrchestratorConfig = {
  maxIterations: 50,
  maxConsecutiveErrors: 3,
  autoApproveReadOnly: true,
};

let nextApprovalId = 1;

export class AgentOrchestrator {
  readonly plan: AgentPlan;
  readonly log: ActivityLog;
  private config: OrchestratorConfig;
  private _status: OrchestratorStatus = 'idle';
  private iterationCount = 0;
  private consecutiveErrors = 0;
  private pendingApproval: ApprovalRequest | null = null;
  private userIntent = '';

  constructor(config?: Partial<OrchestratorConfig>) {
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.plan = new AgentPlan();
    this.log = new ActivityLog();
  }

  /** Get current status. */
  get status(): OrchestratorStatus {
    return this._status;
  }

  /** Get current iteration count. */
  get iterations(): number {
    return this.iterationCount;
  }

  /** Get the user's original intent. */
  get intent(): string {
    return this.userIntent;
  }

  /** Start a new agent task. */
  start(intent: string): void {
    this.userIntent = intent;
    this._status = 'planning';
    this.iterationCount = 0;
    this.consecutiveErrors = 0;
    this.plan.clear();
    this.log.clear();
    this.pendingApproval = null;
    this.log.add('message', `Task started: ${intent}`);
  }

  /** Set the plan steps (after AI generates them). */
  setPlan(steps: string[]): void {
    this.plan.setSteps(steps);
    this._status = 'executing';
    this.log.add('plan_step', `Plan created with ${steps.length} steps`);
  }

  /**
   * Process a tool call from the AI.
   * Returns an ApprovalRequest if approval is needed,
   * or null if the tool can be auto-approved.
   */
  processToolCall(call: ToolCallRequest): ApprovalRequest | null {
    this.iterationCount++;

    if (this.iterationCount > this.config.maxIterations) {
      this._status = 'failed';
      this.log.add('error', `Max iterations (${this.config.maxIterations}) exceeded`);
      return null;
    }

    const toolDef = getToolByName(call.toolName);
    if (!toolDef) {
      this.log.add('error', `Unknown tool: ${call.toolName}`);
      return null;
    }

    // Check if auto-approve
    if (this.config.autoApproveReadOnly && toolDef.approvalLevel === 'none') {
      this.log.add('tool_call', `Auto-approved: ${call.toolName}`, JSON.stringify(call.arguments), call.toolName);
      return null;
    }

    if (toolDef.approvalLevel === 'confirm') {
      const approval: ApprovalRequest = {
        id: nextApprovalId++,
        toolName: call.toolName,
        arguments: call.arguments,
        description: `${toolDef.description} — ${JSON.stringify(call.arguments)}`,
      };
      this.pendingApproval = approval;
      this._status = 'waiting_approval';
      this.log.add('approval_requested', `Approval needed: ${call.toolName}`, approval.description, call.toolName);
      return approval;
    }

    // 'notify' level — log and proceed
    this.log.add('tool_call', `${call.toolName} (notify)`, JSON.stringify(call.arguments), call.toolName);
    return null;
  }

  /** Grant approval for a pending tool call. */
  grantApproval(approvalId: number): boolean {
    if (!this.pendingApproval || this.pendingApproval.id !== approvalId) return false;
    this.log.add('approval_granted', `Approved: ${this.pendingApproval.toolName}`, '', this.pendingApproval.toolName);
    this.pendingApproval = null;
    this._status = 'executing';
    return true;
  }

  /** Deny approval for a pending tool call. */
  denyApproval(approvalId: number): boolean {
    if (!this.pendingApproval || this.pendingApproval.id !== approvalId) return false;
    this.log.add('approval_denied', `Denied: ${this.pendingApproval.toolName}`, '', this.pendingApproval.toolName);
    this.pendingApproval = null;
    this._status = 'executing';
    return true;
  }

  /** Record a tool result. */
  recordToolResult(result: ToolCallResult): void {
    if (result.success) {
      this.consecutiveErrors = 0;
      this.log.add('tool_result', `${result.toolName}: success`, result.output, result.toolName);
    } else {
      this.consecutiveErrors++;
      this.log.add('error', `${result.toolName}: failed`, result.output, result.toolName);

      if (this.consecutiveErrors >= this.config.maxConsecutiveErrors) {
        this._status = 'failed';
        this.log.add('error', `Max consecutive errors (${this.config.maxConsecutiveErrors}) reached`);
      }
    }
  }

  /** Mark the task as completed. */
  complete(): void {
    this._status = 'completed';
    this.log.add('message', 'Task completed');
  }

  /** Mark the task as failed. */
  fail(reason: string): void {
    this._status = 'failed';
    this.log.add('error', `Task failed: ${reason}`);
  }

  /** Pause the agent. */
  pause(): void {
    if (this._status === 'executing') {
      this._status = 'paused';
      this.log.add('message', 'Agent paused');
    }
  }

  /** Resume the agent. */
  resume(): void {
    if (this._status === 'paused') {
      this._status = 'executing';
      this.log.add('message', 'Agent resumed');
    }
  }

  /** Reset the orchestrator. */
  reset(): void {
    this._status = 'idle';
    this.iterationCount = 0;
    this.consecutiveErrors = 0;
    this.pendingApproval = null;
    this.userIntent = '';
    this.plan.clear();
    this.log.clear();
  }

  /** Get pending approval (if any). */
  getPendingApproval(): ApprovalRequest | null {
    return this.pendingApproval;
  }

  /** Check if max iterations reached. */
  isMaxIterationsReached(): boolean {
    return this.iterationCount >= this.config.maxIterations;
  }

  /** Get config. */
  getConfig(): OrchestratorConfig {
    return { ...this.config };
  }
}

/** Reset approval ID counter (for testing). */
export function resetApprovalIds(): void {
  nextApprovalId = 1;
}
