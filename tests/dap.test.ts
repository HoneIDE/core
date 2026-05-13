/**
 * Tests for Slice 7: DAP types and breakpoint manager.
 */
import { describe, test, expect, beforeEach } from 'bun:test';
import {
  createDapRequest, createDapResponse,
  isDapRequest, isDapResponse, isDapEvent,
  encodeDapMessage,
} from '../src/protocols/dap/dap-types';
import { BreakpointManager } from '../src/protocols/dap/breakpoint-manager';

// =============================================================================
// DAP message creation
// =============================================================================

describe('createDapRequest', () => {
  test('creates valid request', () => {
    const req = createDapRequest(1, 'initialize', { adapterID: 'node' });
    expect(req.seq).toBe(1);
    expect(req.type).toBe('request');
    expect(req.command).toBe('initialize');
    expect(req.arguments).toEqual({ adapterID: 'node' });
  });

  test('creates request without arguments', () => {
    const req = createDapRequest(2, 'disconnect');
    expect(req.arguments).toBeUndefined();
  });
});

describe('createDapResponse', () => {
  test('creates success response', () => {
    const resp = createDapResponse(2, 1, 'initialize', true, { supportsConfigurationDoneRequest: true });
    expect(resp.seq).toBe(2);
    expect(resp.type).toBe('response');
    expect(resp.request_seq).toBe(1);
    expect(resp.success).toBe(true);
    expect(resp.command).toBe('initialize');
  });

  test('creates error response', () => {
    const resp = createDapResponse(3, 2, 'launch', false);
    expect(resp.success).toBe(false);
  });
});

// =============================================================================
// Message classification
// =============================================================================

describe('DAP message classification', () => {
  test('isDapRequest', () => {
    expect(isDapRequest({ seq: 1, type: 'request', command: 'launch' })).toBe(true);
    expect(isDapRequest({ seq: 1, type: 'response', command: 'launch' })).toBe(false);
  });

  test('isDapResponse', () => {
    expect(isDapResponse({ seq: 1, type: 'response', request_seq: 1, success: true, command: 'init' })).toBe(true);
    expect(isDapResponse({ seq: 1, type: 'event', event: 'stopped' })).toBe(false);
  });

  test('isDapEvent', () => {
    expect(isDapEvent({ seq: 1, type: 'event', event: 'stopped' })).toBe(true);
    expect(isDapEvent({ seq: 1, type: 'request', command: 'x' })).toBe(false);
  });
});

// =============================================================================
// Message encoding
// =============================================================================

describe('encodeDapMessage', () => {
  test('encodes with Content-Length header', () => {
    const msg = createDapRequest(1, 'initialize');
    const encoded = encodeDapMessage(msg);
    expect(encoded).toContain('Content-Length: ');
    expect(encoded).toContain('\r\n\r\n');
    expect(encoded).toContain('"type":"request"');
  });

  test('Content-Length matches body', () => {
    const msg = createDapRequest(1, 'launch', { program: '/app.js' });
    const encoded = encodeDapMessage(msg);
    const parts = encoded.split('\r\n\r\n');
    const cl = parseInt(parts[0].match(/Content-Length: (\d+)/)![1], 10);
    expect(cl).toBe(Buffer.byteLength(parts[1], 'utf-8'));
  });
});

// =============================================================================
// BreakpointManager
// =============================================================================

describe('BreakpointManager', () => {
  let mgr: BreakpointManager;

  beforeEach(() => {
    mgr = new BreakpointManager();
  });

  test('setBreakpoints creates managed breakpoints', () => {
    const bps = mgr.setBreakpoints('/a.ts', [
      { line: 10 },
      { line: 20, condition: 'x > 5' },
    ]);
    expect(bps).toHaveLength(2);
    expect(bps[0].line).toBe(10);
    expect(bps[0].verified).toBe(false);
    expect(bps[1].condition).toBe('x > 5');
  });

  test('setBreakpoints assigns unique IDs', () => {
    const bps1 = mgr.setBreakpoints('/a.ts', [{ line: 1 }]);
    const bps2 = mgr.setBreakpoints('/b.ts', [{ line: 1 }]);
    expect(bps1[0].id).not.toBe(bps2[0].id);
  });

  test('setBreakpoints replaces previous', () => {
    mgr.setBreakpoints('/a.ts', [{ line: 1 }, { line: 2 }]);
    const bps = mgr.setBreakpoints('/a.ts', [{ line: 3 }]);
    expect(bps).toHaveLength(1);
    expect(mgr.getBreakpoints('/a.ts')).toHaveLength(1);
  });

  test('getBreakpoints returns empty for unknown file', () => {
    expect(mgr.getBreakpoints('/unknown.ts')).toHaveLength(0);
  });

  test('getAllBreakpoints returns all files', () => {
    mgr.setBreakpoints('/a.ts', [{ line: 1 }]);
    mgr.setBreakpoints('/b.ts', [{ line: 2 }, { line: 3 }]);
    const all = mgr.getAllBreakpoints();
    expect(all).toHaveLength(2);
    const total = all.reduce((sum, f) => sum + f.breakpoints.length, 0);
    expect(total).toBe(3);
  });

  test('toggleBreakpoint adds when not present', () => {
    const bps = mgr.toggleBreakpoint('/a.ts', 10);
    expect(bps).toHaveLength(1);
    expect(bps[0].line).toBe(10);
  });

  test('toggleBreakpoint removes when present', () => {
    mgr.toggleBreakpoint('/a.ts', 10);
    const bps = mgr.toggleBreakpoint('/a.ts', 10);
    expect(bps).toHaveLength(0);
  });

  test('toggleBreakpoint preserves others', () => {
    mgr.setBreakpoints('/a.ts', [{ line: 5 }, { line: 10 }, { line: 15 }]);
    const bps = mgr.toggleBreakpoint('/a.ts', 10);
    expect(bps).toHaveLength(2);
    expect(bps.find(b => b.line === 10)).toBeUndefined();
    expect(bps.find(b => b.line === 5)).toBeDefined();
    expect(bps.find(b => b.line === 15)).toBeDefined();
  });

  test('clearFile removes all for a file', () => {
    mgr.setBreakpoints('/a.ts', [{ line: 1 }]);
    mgr.setBreakpoints('/b.ts', [{ line: 2 }]);
    mgr.clearFile('/a.ts');
    expect(mgr.getBreakpoints('/a.ts')).toHaveLength(0);
    expect(mgr.getBreakpoints('/b.ts')).toHaveLength(1);
  });

  test('clearAll removes everything', () => {
    mgr.setBreakpoints('/a.ts', [{ line: 1 }]);
    mgr.setBreakpoints('/b.ts', [{ line: 2 }]);
    mgr.clearAll();
    expect(mgr.count()).toBe(0);
  });

  test('count returns total breakpoints', () => {
    mgr.setBreakpoints('/a.ts', [{ line: 1 }, { line: 2 }]);
    mgr.setBreakpoints('/b.ts', [{ line: 3 }]);
    expect(mgr.count()).toBe(3);
  });

  test('hasBreakpoint checks specific line', () => {
    mgr.setBreakpoints('/a.ts', [{ line: 10 }, { line: 20 }]);
    expect(mgr.hasBreakpoint('/a.ts', 10)).toBe(true);
    expect(mgr.hasBreakpoint('/a.ts', 15)).toBe(false);
    expect(mgr.hasBreakpoint('/b.ts', 10)).toBe(false);
  });

  test('updateVerification marks breakpoints as verified', () => {
    mgr.setBreakpoints('/a.ts', [{ line: 10 }, { line: 20 }]);
    mgr.updateVerification('/a.ts', [
      { verified: true, line: 10 },
      { verified: true, line: 21 },  // adjusted by server
    ]);
    const bps = mgr.getBreakpoints('/a.ts');
    expect(bps[0].verified).toBe(true);
    expect(bps[1].verified).toBe(true);
    expect(bps[1].line).toBe(21);  // line adjusted
  });

  test('toSetBreakpointsArgs produces DAP format', () => {
    mgr.setBreakpoints('/a.ts', [
      { line: 10, condition: 'x > 5' },
      { line: 20 },
    ]);
    const args = mgr.toSetBreakpointsArgs('/a.ts');
    expect(args.source.path).toBe('/a.ts');
    expect(args.breakpoints).toHaveLength(2);
    expect(args.breakpoints[0].line).toBe(10);
    expect(args.breakpoints[0].condition).toBe('x > 5');
    expect(args.breakpoints[1].condition).toBeUndefined();
  });

  test('logpoint breakpoint', () => {
    mgr.setBreakpoints('/a.ts', [{ line: 10, logMessage: 'value is {x}' }]);
    const bps = mgr.getBreakpoints('/a.ts');
    expect(bps[0].logMessage).toBe('value is {x}');
  });

  test('hit count breakpoint', () => {
    mgr.setBreakpoints('/a.ts', [{ line: 10, hitCondition: '>=3' }]);
    const bps = mgr.getBreakpoints('/a.ts');
    expect(bps[0].hitCondition).toBe('>=3');
  });
});

// =============================================================================
// DapManager
// =============================================================================

import { DapManager, resetDapManagerIds } from '../src/protocols/dap/dap-manager';
import type { DebugConfig } from '../src/protocols/dap/dap-manager';

describe('DapManager', () => {
  test('createSession creates initializing session', () => {
    resetDapManagerIds();
    const mgr = new DapManager();
    const config: DebugConfig = {
      type: 'node',
      name: 'Launch',
      request: 'launch',
      program: '/app.js',
    };
    const session = mgr.createSession(config);
    expect(session.id).toBe('debug-1');
    expect(session.status).toBe('initializing');
    expect(session.config.program).toBe('/app.js');
    expect(session.threadIds).toHaveLength(0);
    expect(session.activeThreadId).toBeNull();
  });

  test('markPaused sets status and active thread', () => {
    resetDapManagerIds();
    const mgr = new DapManager();
    const session = mgr.createSession({ type: 'node', name: 'Test', request: 'launch' });
    mgr.markRunning(session.id);
    mgr.markPaused(session.id, 42);
    const s = mgr.getSession(session.id)!;
    expect(s.status).toBe('paused');
    expect(s.activeThreadId).toBe(42);
  });

  test('hasActiveSession returns true when running or paused', () => {
    resetDapManagerIds();
    const mgr = new DapManager();
    expect(mgr.hasActiveSession()).toBe(false);
    const s1 = mgr.createSession({ type: 'node', name: 'A', request: 'launch' });
    expect(mgr.hasActiveSession()).toBe(false); // initializing
    mgr.markRunning(s1.id);
    expect(mgr.hasActiveSession()).toBe(true);
    mgr.markStopped(s1.id);
    expect(mgr.hasActiveSession()).toBe(false);
  });
});

// =============================================================================
// DapClient
// =============================================================================

import { DapClient, resetDapClientSeq } from '../src/protocols/dap/dap-client';

describe('DapClient', () => {
  let client: DapClient;

  beforeEach(() => {
    resetDapClientSeq();
    client = new DapClient();
  });

  test('initialize creates correct request', () => {
    const req = client.initialize('node');
    expect(req.type).toBe('request');
    expect(req.command).toBe('initialize');
    expect(req.seq).toBe(1);
    const args = req.arguments as any;
    expect(args.adapterID).toBe('node');
    expect(args.linesStartAt1).toBe(true);
  });

  test('launch creates launch request', () => {
    const req = client.launch('/app.js', ['--debug'], '/project');
    expect(req.command).toBe('launch');
    const args = req.arguments as any;
    expect(args.program).toBe('/app.js');
    expect(args.args).toEqual(['--debug']);
    expect(args.cwd).toBe('/project');
  });

  test('setBreakpoints creates correct request', () => {
    const req = client.setBreakpoints('/src/app.ts', [
      { line: 10 },
      { line: 20, condition: 'x > 5' },
    ]);
    expect(req.command).toBe('setBreakpoints');
    const args = req.arguments as any;
    expect(args.source.path).toBe('/src/app.ts');
    expect(args.breakpoints).toHaveLength(2);
    expect(args.breakpoints[1].condition).toBe('x > 5');
  });

  test('stackTrace creates request with levels', () => {
    const req = client.stackTrace(1);
    expect(req.command).toBe('stackTrace');
    const args = req.arguments as any;
    expect(args.threadId).toBe(1);
    expect(args.startFrame).toBe(0);
    expect(args.levels).toBe(20);
  });
});

// =============================================================================
// Task config & runner
// =============================================================================

import { parseTaskConfig, findDefaultTask } from '../src/tasks/task-config';
import { TaskRunner, resetTaskRunnerIds } from '../src/tasks/task-runner';

describe('parseTaskConfig', () => {
  test('parses tasks.json format', () => {
    const json = JSON.stringify({
      version: '2.0.0',
      tasks: [
        {
          label: 'Build',
          type: 'shell',
          command: 'npm',
          args: ['run', 'build'],
          group: { kind: 'build', isDefault: true },
        },
        {
          label: 'Test',
          type: 'shell',
          command: 'bun',
          args: ['test'],
          group: 'test',
        },
      ],
    });
    const config = parseTaskConfig(json);
    expect(config.version).toBe('2.0.0');
    expect(config.tasks).toHaveLength(2);
    expect(config.tasks[0].label).toBe('Build');
    expect(config.tasks[0].group).toBe('build');
    expect(config.tasks[0].isDefault).toBe(true);
    expect(config.tasks[1].group).toBe('test');
  });
});

describe('findDefaultTask', () => {
  test('finds default build task', () => {
    const config = parseTaskConfig(JSON.stringify({
      version: '2.0.0',
      tasks: [
        { label: 'Build', command: 'make', group: { kind: 'build', isDefault: true } },
        { label: 'Lint', command: 'eslint', group: 'none' },
      ],
    }));
    const task = findDefaultTask(config, 'build');
    expect(task).toBeDefined();
    expect(task!.label).toBe('Build');
  });
});

describe('TaskRunner', () => {
  test('createExecution creates pending execution', () => {
    resetTaskRunnerIds();
    const runner = new TaskRunner();
    const exec = runner.createExecution({
      label: 'Build',
      type: 'shell',
      command: 'npm',
      args: ['run', 'build'],
    });
    expect(exec.id).toBe('task-1');
    expect(exec.status).toBe('pending');
    expect(exec.exitCode).toBeNull();
    expect(exec.task.label).toBe('Build');
  });

  test('markCompleted sets status and output', () => {
    resetTaskRunnerIds();
    const runner = new TaskRunner();
    const exec = runner.createExecution({
      label: 'Test',
      type: 'shell',
      command: 'bun',
      args: ['test'],
    });
    runner.markRunning(exec.id);
    runner.markCompleted(exec.id, 0, 'All tests passed');
    const updated = runner.getExecution(exec.id)!;
    expect(updated.status).toBe('completed');
    expect(updated.exitCode).toBe(0);
    expect(updated.output).toBe('All tests passed');
    expect(updated.endTime).not.toBeNull();
  });

  test('buildCommand concatenates command and args', () => {
    const runner = new TaskRunner();
    const cmd = runner.buildCommand({
      label: 'Build',
      type: 'shell',
      command: 'npm',
      args: ['run', 'build'],
    });
    expect(cmd).toBe('npm run build');
  });
});
