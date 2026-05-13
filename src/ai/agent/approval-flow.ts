export type ApprovalStatus = 'pending' | 'approved' | 'rejected';

export interface PendingApproval {
  id: string;
  toolName: string;
  args: Record<string, unknown>;
  status: ApprovalStatus;
  reason?: string;
}

const DESTRUCTIVE_TOOLS = ['file_delete', 'file_edit', 'git_commit', 'terminal_run'];

let nextApprovalId = 1;
export function resetApprovalFlowIds(): void { nextApprovalId = 1; }

export function requiresApproval(toolName: string): boolean {
  return DESTRUCTIVE_TOOLS.includes(toolName);
}

export function createApproval(toolName: string, args: Record<string, unknown>): PendingApproval {
  return {
    id: `approval-${nextApprovalId++}`,
    toolName,
    args,
    status: 'pending',
  };
}

export function resolveApproval(approval: PendingApproval, approved: boolean, reason?: string): void {
  approval.status = approved ? 'approved' : 'rejected';
  approval.reason = reason;
}
