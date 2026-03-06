/**
 * Build domain handler — wraps TaskRunner.
 */

import type { DomainHandler } from '../sdk-handler';
import type { TaskRunner, TaskExecution } from '../../tasks/task-runner';
import type { TaskDefinition } from '../../tasks/task-config';

export class BuildHandler implements DomainHandler {
  readonly domain = 'build';
  private runner: TaskRunner;
  private defaultTask: TaskDefinition;

  constructor(runner: TaskRunner, defaultTask?: TaskDefinition) {
    this.runner = runner;
    this.defaultTask = defaultTask ?? { label: 'build', type: 'shell', command: 'echo', args: ['no build configured'] };
  }

  async handle(operation: string, payload: Record<string, unknown>): Promise<Record<string, unknown>> {
    switch (operation) {
      case 'start':
        return this.start(payload);
      case 'cancel':
        return this.cancel(payload);
      case 'status':
        return this.status(payload);
      case 'log':
        return this.log(payload);
      default:
        throw new Error(`Unknown operation: build.${operation}`);
    }
  }

  getSubscribableEvents(): string[] {
    return ['onProgress'];
  }

  private start(_payload: Record<string, unknown>): Record<string, unknown> {
    const exec = this.runner.createExecution(this.defaultTask);
    this.runner.markRunning(exec.id);
    return { executionId: exec.id };
  }

  private cancel(payload: Record<string, unknown>): Record<string, unknown> {
    const executionId = payload.executionId as string;
    const exec = this.runner.getExecution(executionId);
    if (exec && exec.status === 'running') {
      this.runner.markCompleted(executionId, 130, 'Cancelled');
      return { success: true };
    }
    return { success: false };
  }

  private status(payload: Record<string, unknown>): Record<string, unknown> {
    const executionId = payload.executionId as string;
    const exec = this.runner.getExecution(executionId);
    if (!exec) throw new Error(`Execution not found: ${executionId}`);
    return { executionId: exec.id, status: exec.status, exitCode: exec.exitCode };
  }

  private log(payload: Record<string, unknown>): Record<string, unknown> {
    const executionId = payload.executionId as string;
    const exec = this.runner.getExecution(executionId);
    if (!exec) throw new Error(`Execution not found: ${executionId}`);
    return { output: exec.output, isComplete: exec.status === 'completed' || exec.status === 'failed' };
  }
}
