import { describe, test, expect, beforeEach } from 'bun:test';
import { parseTaskConfig, findDefaultTask, getTasksByGroup } from '../src/tasks/task-config';
import type { TaskDefinition, TasksConfig } from '../src/tasks/task-config';
import { TaskRunner, resetTaskRunnerIds } from '../src/tasks/task-runner';

describe('parseTaskConfig', () => {
  test('parses minimal tasks.json', () => {
    const config = parseTaskConfig(JSON.stringify({ version: '2.0.0', tasks: [] }));
    expect(config.version).toBe('2.0.0');
    expect(config.tasks).toHaveLength(0);
  });

  test('defaults missing version', () => {
    const config = parseTaskConfig(JSON.stringify({ tasks: [] }));
    expect(config.version).toBe('2.0.0');
  });

  test('parses task with group object', () => {
    const config = parseTaskConfig(JSON.stringify({
      version: '2.0.0',
      tasks: [{ label: 'Build', command: 'make', group: { kind: 'build', isDefault: true } }],
    }));
    expect(config.tasks[0].group).toBe('build');
    expect(config.tasks[0].isDefault).toBe(true);
  });

  test('parses task with group string', () => {
    const config = parseTaskConfig(JSON.stringify({
      version: '2.0.0',
      tasks: [{ label: 'Test', command: 'bun test', group: 'test' }],
    }));
    expect(config.tasks[0].group).toBe('test');
  });

  test('defaults label to Unnamed', () => {
    const config = parseTaskConfig(JSON.stringify({ tasks: [{ command: 'echo hi' }] }));
    expect(config.tasks[0].label).toBe('Unnamed');
  });

  test('preserves args array', () => {
    const config = parseTaskConfig(JSON.stringify({
      tasks: [{ label: 'Run', command: 'node', args: ['index.js', '--port', '3000'] }],
    }));
    expect(config.tasks[0].args).toEqual(['index.js', '--port', '3000']);
  });

  test('preserves presentation options', () => {
    const config = parseTaskConfig(JSON.stringify({
      tasks: [{ label: 'Watch', command: 'npm run watch', presentation: { reveal: 'silent', panel: 'dedicated' } }],
    }));
    expect(config.tasks[0].presentation).toEqual({ reveal: 'silent', panel: 'dedicated' });
  });
});

describe('findDefaultTask', () => {
  const config: TasksConfig = {
    version: '2.0.0',
    tasks: [
      { label: 'Build', type: 'shell', command: 'make', group: 'build', isDefault: true },
      { label: 'Test', type: 'shell', command: 'bun test', group: 'test', isDefault: false },
      { label: 'Lint', type: 'shell', command: 'eslint .', group: 'none' },
    ],
  };

  test('finds default build task', () => {
    const task = findDefaultTask(config, 'build');
    expect(task).toBeDefined();
    expect(task!.label).toBe('Build');
  });

  test('returns undefined for no default test task', () => {
    const task = findDefaultTask(config, 'test');
    expect(task).toBeUndefined();
  });
});

describe('getTasksByGroup', () => {
  const config: TasksConfig = {
    version: '2.0.0',
    tasks: [
      { label: 'Build', type: 'shell', command: 'make', group: 'build' },
      { label: 'Build Release', type: 'shell', command: 'make release', group: 'build' },
      { label: 'Test', type: 'shell', command: 'bun test', group: 'test' },
      { label: 'Lint', type: 'shell', command: 'eslint .', group: 'none' },
    ],
  };

  test('returns build tasks', () => {
    const tasks = getTasksByGroup(config, 'build');
    expect(tasks).toHaveLength(2);
  });

  test('returns test tasks', () => {
    const tasks = getTasksByGroup(config, 'test');
    expect(tasks).toHaveLength(1);
  });

  test('returns none tasks', () => {
    const tasks = getTasksByGroup(config, 'none');
    expect(tasks).toHaveLength(1);
  });
});

describe('TaskRunner', () => {
  beforeEach(() => {
    resetTaskRunnerIds();
  });

  test('creates sequential IDs', () => {
    const runner = new TaskRunner();
    const e1 = runner.createExecution({ label: 'A', type: 'shell', command: 'a' });
    const e2 = runner.createExecution({ label: 'B', type: 'shell', command: 'b' });
    expect(e1.id).toBe('task-1');
    expect(e2.id).toBe('task-2');
  });

  test('getAllExecutions returns all', () => {
    const runner = new TaskRunner();
    runner.createExecution({ label: 'A', type: 'shell', command: 'a' });
    runner.createExecution({ label: 'B', type: 'shell', command: 'b' });
    expect(runner.getAllExecutions()).toHaveLength(2);
  });

  test('getRunningExecutions filters', () => {
    const runner = new TaskRunner();
    const e1 = runner.createExecution({ label: 'A', type: 'shell', command: 'a' });
    const e2 = runner.createExecution({ label: 'B', type: 'shell', command: 'b' });
    runner.markRunning(e1.id);
    expect(runner.getRunningExecutions()).toHaveLength(1);
    expect(runner.getRunningExecutions()[0].id).toBe(e1.id);
  });

  test('markCompleted with non-zero exit marks as failed', () => {
    const runner = new TaskRunner();
    const e = runner.createExecution({ label: 'Fail', type: 'shell', command: 'false' });
    runner.markRunning(e.id);
    runner.markCompleted(e.id, 1, 'Error occurred');
    const updated = runner.getExecution(e.id)!;
    expect(updated.status).toBe('failed');
    expect(updated.exitCode).toBe(1);
  });

  test('buildCommand with no args', () => {
    const runner = new TaskRunner();
    expect(runner.buildCommand({ label: 'X', type: 'shell', command: 'ls' })).toBe('ls');
  });
});
