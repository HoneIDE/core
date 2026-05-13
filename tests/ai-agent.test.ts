/**
 * Tests for Slice 12: AI Agent Mode.
 */
import { describe, test, expect, beforeEach } from 'bun:test';
import {
  AgentOrchestrator, resetApprovalIds,
  AgentPlan, resetPlanIds,
  ActivityLog, resetActivityIds,
  AGENT_TOOLS, getToolByName, getToolsForAPI,
  buildAgentSystemPrompt, buildActivitySummary,
  executeTool, requiresApproval, createApproval, resolveApproval, resetApprovalFlowIds,
  classifyError, shouldRetry, getRetryDelay, MAX_RETRIES,
  type ToolCallRequest,
} from '../src/ai/agent/index';

// =============================================================================
// Tools
// =============================================================================

describe('Agent Tools', () => {
  test('AGENT_TOOLS has all 15 tools', () => {
    expect(AGENT_TOOLS.length).toBe(15);
  });

  test('getToolByName finds tools', () => {
    const tool = getToolByName('file_read');
    expect(tool).not.toBeNull();
    expect(tool!.name).toBe('file_read');
    expect(tool!.approvalLevel).toBe('none');
  });

  test('getToolByName returns null for unknown', () => {
    expect(getToolByName('nonexistent')).toBeNull();
  });

  test('file_edit requires confirm', () => {
    expect(getToolByName('file_edit')!.approvalLevel).toBe('confirm');
  });

  test('web_fetch requires notify', () => {
    expect(getToolByName('web_fetch')!.approvalLevel).toBe('notify');
  });

  test('getToolsForAPI returns formatted list', () => {
    const tools = getToolsForAPI();
    expect(tools.length).toBe(15);
    expect(tools[0].name).toBeDefined();
    expect(tools[0].description).toBeDefined();
    expect(tools[0].parameters).toBeDefined();
  });
});

// =============================================================================
// ActivityLog
// =============================================================================

describe('ActivityLog', () => {
  let log: ActivityLog;

  beforeEach(() => {
    resetActivityIds();
    log = new ActivityLog();
  });

  test('starts empty', () => {
    expect(log.count).toBe(0);
  });

  test('add creates entry', () => {
    const entry = log.add('message', 'Hello');
    expect(entry.id).toBe(1);
    expect(entry.type).toBe('message');
    expect(entry.summary).toBe('Hello');
    expect(log.count).toBe(1);
  });

  test('setDuration updates entry', () => {
    const entry = log.add('tool_call', 'read file');
    log.setDuration(entry.id, 42);
    expect(log.getAll()[0].durationMs).toBe(42);
  });

  test('getLast returns recent entries', () => {
    log.add('message', 'a');
    log.add('message', 'b');
    log.add('message', 'c');
    const last2 = log.getLast(2);
    expect(last2).toHaveLength(2);
    expect(last2[0].summary).toBe('b');
    expect(last2[1].summary).toBe('c');
  });

  test('getByType filters entries', () => {
    log.add('message', 'a');
    log.add('error', 'b');
    log.add('message', 'c');
    expect(log.getByType('error')).toHaveLength(1);
    expect(log.getByType('message')).toHaveLength(2);
  });

  test('clear removes all', () => {
    log.add('message', 'a');
    log.clear();
    expect(log.count).toBe(0);
  });

  test('formatSummary', () => {
    log.add('tool_call', 'file_read');
    log.add('error', 'failed');
    const summary = log.formatSummary();
    expect(summary).toContain('tool_call');
    expect(summary).toContain('error');
  });

  test('respects maxEntries', () => {
    const small = new ActivityLog(3);
    for (let i = 0; i < 5; i++) small.add('message', `msg${i}`);
    expect(small.count).toBe(3);
  });
});

// =============================================================================
// AgentPlan
// =============================================================================

describe('AgentPlan', () => {
  let plan: AgentPlan;

  beforeEach(() => {
    resetPlanIds();
    plan = new AgentPlan();
  });

  test('starts empty', () => {
    expect(plan.stepCount).toBe(0);
    expect(plan.getCurrentStep()).toBeNull();
  });

  test('addStep creates step', () => {
    const step = plan.addStep('Read config file', 'file_read');
    expect(step.id).toBe(1);
    expect(step.status).toBe('pending');
    expect(step.toolName).toBe('file_read');
    expect(plan.stepCount).toBe(1);
  });

  test('setSteps replaces all', () => {
    plan.addStep('old');
    plan.setSteps(['Step 1', 'Step 2', 'Step 3']);
    expect(plan.stepCount).toBe(3);
    expect(plan.getSteps()[0].description).toBe('Step 1');
  });

  test('advanceToNext walks through steps', () => {
    plan.setSteps(['A', 'B', 'C']);
    const s1 = plan.advanceToNext();
    expect(s1!.description).toBe('A');
    expect(s1!.status).toBe('in_progress');

    plan.completeCurrentStep('done');
    const s2 = plan.advanceToNext();
    expect(s2!.description).toBe('B');
  });

  test('advanceToNext returns null when done', () => {
    plan.setSteps(['A']);
    plan.advanceToNext();
    plan.completeCurrentStep();
    expect(plan.advanceToNext()).toBeNull();
  });

  test('completeCurrentStep sets result', () => {
    plan.setSteps(['A']);
    plan.advanceToNext();
    plan.completeCurrentStep('all good');
    expect(plan.getSteps()[0].result).toBe('all good');
  });

  test('failCurrentStep marks as failed', () => {
    plan.setSteps(['A']);
    plan.advanceToNext();
    plan.failCurrentStep('error');
    expect(plan.getSteps()[0].status).toBe('failed');
  });

  test('skipStep marks as skipped', () => {
    plan.setSteps(['A', 'B']);
    const steps = plan.getSteps();
    plan.skipStep(steps[0].id);
    expect(plan.getSteps()[0].status).toBe('skipped');
  });

  test('reorderStep moves steps', () => {
    plan.setSteps(['A', 'B', 'C']);
    plan.reorderStep(2, 0);
    const steps = plan.getSteps();
    expect(steps[0].description).toBe('C');
    expect(steps[1].description).toBe('A');
    expect(steps[2].description).toBe('B');
  });

  test('isComplete checks all steps', () => {
    plan.setSteps(['A', 'B']);
    expect(plan.isComplete()).toBe(false);
    plan.advanceToNext();
    plan.completeCurrentStep();
    expect(plan.isComplete()).toBe(false);
    plan.advanceToNext();
    plan.completeCurrentStep();
    expect(plan.isComplete()).toBe(true);
  });

  test('getProgress tracks completion', () => {
    plan.setSteps(['A', 'B', 'C']);
    plan.advanceToNext();
    plan.completeCurrentStep();
    const progress = plan.getProgress();
    expect(progress.completed).toBe(1);
    expect(progress.total).toBe(3);
  });
});

// =============================================================================
// AgentOrchestrator
// =============================================================================

describe('AgentOrchestrator', () => {
  let orch: AgentOrchestrator;

  beforeEach(() => {
    resetApprovalIds();
    resetActivityIds();
    resetPlanIds();
    orch = new AgentOrchestrator({ maxIterations: 10, maxConsecutiveErrors: 2 });
  });

  test('starts idle', () => {
    expect(orch.status).toBe('idle');
    expect(orch.iterations).toBe(0);
  });

  test('start sets planning status', () => {
    orch.start('Fix the bug');
    expect(orch.status).toBe('planning');
    expect(orch.intent).toBe('Fix the bug');
  });

  test('setPlan transitions to executing', () => {
    orch.start('Task');
    orch.setPlan(['Step 1', 'Step 2']);
    expect(orch.status).toBe('executing');
    expect(orch.plan.stepCount).toBe(2);
  });

  test('processToolCall auto-approves read-only tools', () => {
    orch.start('Task');
    orch.setPlan(['Read file']);
    const call: ToolCallRequest = { toolName: 'file_read', arguments: { path: '/a.ts' } };
    const approval = orch.processToolCall(call);
    expect(approval).toBeNull(); // auto-approved
    expect(orch.iterations).toBe(1);
  });

  test('processToolCall requests approval for confirm tools', () => {
    orch.start('Task');
    orch.setPlan(['Edit file']);
    const call: ToolCallRequest = { toolName: 'file_edit', arguments: { path: '/a.ts', old_text: 'x', new_text: 'y' } };
    const approval = orch.processToolCall(call);
    expect(approval).not.toBeNull();
    expect(approval!.toolName).toBe('file_edit');
    expect(orch.status).toBe('waiting_approval');
  });

  test('grantApproval resumes executing', () => {
    orch.start('Task');
    orch.setPlan(['Edit']);
    const call: ToolCallRequest = { toolName: 'file_edit', arguments: { path: '/a.ts', old_text: 'x', new_text: 'y' } };
    const approval = orch.processToolCall(call)!;
    orch.grantApproval(approval.id);
    expect(orch.status).toBe('executing');
  });

  test('denyApproval resumes executing', () => {
    orch.start('Task');
    orch.setPlan(['Edit']);
    const approval = orch.processToolCall({ toolName: 'file_edit', arguments: { path: '/a.ts', old_text: 'x', new_text: 'y' } })!;
    orch.denyApproval(approval.id);
    expect(orch.status).toBe('executing');
    expect(orch.getPendingApproval()).toBeNull();
  });

  test('recordToolResult resets error count on success', () => {
    orch.start('Task');
    orch.setPlan(['Step']);
    orch.recordToolResult({ toolName: 'file_read', success: true, output: 'ok', durationMs: 10 });
    expect(orch.status).toBe('executing');
  });

  test('recordToolResult fails after max consecutive errors', () => {
    orch.start('Task');
    orch.setPlan(['Step']);
    orch.recordToolResult({ toolName: 'terminal_run', success: false, output: 'err', durationMs: 10 });
    orch.recordToolResult({ toolName: 'terminal_run', success: false, output: 'err', durationMs: 10 });
    expect(orch.status).toBe('failed');
  });

  test('max iterations stops execution', () => {
    orch.start('Task');
    orch.setPlan(['Step']);
    for (let i = 0; i < 11; i++) {
      orch.processToolCall({ toolName: 'file_read', arguments: { path: '/a.ts' } });
    }
    expect(orch.status).toBe('failed');
  });

  test('pause and resume', () => {
    orch.start('Task');
    orch.setPlan(['Step']);
    orch.pause();
    expect(orch.status).toBe('paused');
    orch.resume();
    expect(orch.status).toBe('executing');
  });

  test('complete marks done', () => {
    orch.start('Task');
    orch.setPlan(['Step']);
    orch.complete();
    expect(orch.status).toBe('completed');
  });

  test('fail marks failed', () => {
    orch.start('Task');
    orch.setPlan(['Step']);
    orch.fail('oops');
    expect(orch.status).toBe('failed');
  });

  test('reset returns to idle', () => {
    orch.start('Task');
    orch.setPlan(['Step']);
    orch.processToolCall({ toolName: 'file_read', arguments: {} });
    orch.reset();
    expect(orch.status).toBe('idle');
    expect(orch.iterations).toBe(0);
    expect(orch.plan.stepCount).toBe(0);
    expect(orch.log.count).toBe(0);
  });
});

// =============================================================================
// Context Builder
// =============================================================================

describe('Context Builder', () => {
  test('buildAgentSystemPrompt includes workspace info', () => {
    const prompt = buildAgentSystemPrompt(
      { rootPath: '/home/user/project', name: 'my-project', language: 'TypeScript', framework: 'React' },
      ['file_read', 'file_edit'],
    );
    expect(prompt).toContain('my-project');
    expect(prompt).toContain('TypeScript');
    expect(prompt).toContain('React');
    expect(prompt).toContain('file_read');
  });

  test('buildActivitySummary formats entries', () => {
    const entries = [
      { type: 'tool_call', summary: 'read file.ts' },
      { type: 'tool_result', summary: 'success' },
    ];
    const summary = buildActivitySummary(entries);
    expect(summary).toContain('read file.ts');
    expect(summary).toContain('success');
  });

  test('buildActivitySummary handles empty', () => {
    expect(buildActivitySummary([])).toBe('No previous actions.');
  });

  test('buildActivitySummary limits entries', () => {
    const entries = [];
    for (let i = 0; i < 20; i++) entries.push({ type: 'message', summary: `msg${i}` });
    const summary = buildActivitySummary(entries, 5);
    // Should only include last 5
    expect(summary).toContain('msg15');
    expect(summary).not.toContain('msg14');
  });
});

// =============================================================================
// Tool Implementations
// =============================================================================

describe('executeTool', () => {
  const root = '/home/user/project';

  test('file_read success', () => {
    const result = executeTool('file_read', { path: 'src/main.ts' }, root);
    expect(result.success).toBe(true);
    expect(result.output).toContain('/home/user/project/src/main.ts');
  });

  test('file_read path outside workspace', () => {
    const result = executeTool('file_read', { path: '/etc/passwd' }, root);
    expect(result.success).toBe(false);
    expect(result.error).toBe('Path outside workspace');
  });

  test('file_edit returns success', () => {
    const result = executeTool('file_edit', { path: 'src/app.ts', old_text: 'hello', new_text: 'world' }, root);
    expect(result.success).toBe(true);
    expect(result.output).toContain('replace 5 chars');
  });

  test('file_delete returns success', () => {
    const result = executeTool('file_delete', { path: 'tmp/old.ts' }, root);
    expect(result.success).toBe(true);
    expect(result.output).toContain('would delete');
  });

  test('file_create returns success', () => {
    const result = executeTool('file_create', { path: 'src/new.ts', content: 'export const x = 1;' }, root);
    expect(result.success).toBe(true);
    expect(result.output).toContain('would create');
    expect(result.output).toContain('19 chars');
  });

  test('search_text empty query fails', () => {
    const result = executeTool('search_text', { query: '' }, root);
    expect(result.success).toBe(false);
    expect(result.error).toBe('Empty query');
  });

  test('git_status returns success', () => {
    const result = executeTool('git_status', {}, root);
    expect(result.success).toBe(true);
    expect(result.output).toContain('git status');
  });

  test('terminal_run blocked command', () => {
    const result = executeTool('terminal_run', { command: 'rm -rf /' }, root);
    expect(result.success).toBe(false);
    expect(result.error).toBe('Blocked dangerous command');
  });

  test('web_fetch invalid URL scheme', () => {
    const result = executeTool('web_fetch', { url: 'ftp://example.com' }, root);
    expect(result.success).toBe(false);
    expect(result.error).toBe('Invalid URL scheme');
  });

  test('unknown tool returns error', () => {
    const result = executeTool('nonexistent_tool', {}, root);
    expect(result.success).toBe(false);
    expect(result.error).toContain('Unknown tool');
  });
});

// =============================================================================
// Approval Flow
// =============================================================================

describe('Approval Flow', () => {
  test('requiresApproval for destructive tools', () => {
    expect(requiresApproval('file_delete')).toBe(true);
    expect(requiresApproval('file_edit')).toBe(true);
    expect(requiresApproval('git_commit')).toBe(true);
    expect(requiresApproval('terminal_run')).toBe(true);
  });

  test('requiresApproval false for non-destructive tools', () => {
    expect(requiresApproval('file_read')).toBe(false);
    expect(requiresApproval('search_text')).toBe(false);
    expect(requiresApproval('git_status')).toBe(false);
  });
});

// =============================================================================
// Error Recovery
// =============================================================================

describe('Error Recovery', () => {
  test('classifyError detects transient errors', () => {
    expect(classifyError('Connection timeout')).toBe('transient');
    expect(classifyError('ECONNRESET')).toBe('transient');
    expect(classifyError('ECONNREFUSED')).toBe('transient');
  });

  test('classifyError detects rate limit', () => {
    expect(classifyError('429 Too Many Requests')).toBe('rate_limit');
    expect(classifyError('Rate limit exceeded')).toBe('rate_limit');
  });

  test('shouldRetry returns true for transient and rate_limit', () => {
    expect(shouldRetry('transient')).toBe(true);
    expect(shouldRetry('rate_limit')).toBe(true);
    expect(shouldRetry('auth')).toBe(false);
    expect(shouldRetry('permanent')).toBe(false);
    expect(shouldRetry('unknown')).toBe(false);
  });
});
