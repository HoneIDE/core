/**
 * Task runner — executes task definitions.
 */
import type { TaskDefinition } from './task-config';

export interface TaskExecution {
  id: string;
  task: TaskDefinition;
  status: 'pending' | 'running' | 'completed' | 'failed';
  exitCode: number | null;
  output: string;
  startTime: number;
  endTime: number | null;
}

let nextExecId = 1;
export function resetTaskRunnerIds(): void { nextExecId = 1; }

export class TaskRunner {
  private executions: Map<string, TaskExecution> = new Map();

  buildCommand(task: TaskDefinition): string {
    let cmd = task.command;
    if (task.args && task.args.length > 0) {
      cmd += ' ' + task.args.join(' ');
    }
    return cmd;
  }

  createExecution(task: TaskDefinition): TaskExecution {
    const id = `task-${nextExecId++}`;
    const exec: TaskExecution = {
      id,
      task,
      status: 'pending',
      exitCode: null,
      output: '',
      startTime: Date.now(),
      endTime: null,
    };
    this.executions.set(id, exec);
    return exec;
  }

  markRunning(id: string): void {
    const e = this.executions.get(id);
    if (e) e.status = 'running';
  }

  markCompleted(id: string, exitCode: number, output: string): void {
    const e = this.executions.get(id);
    if (e) {
      e.status = exitCode === 0 ? 'completed' : 'failed';
      e.exitCode = exitCode;
      e.output = output;
      e.endTime = Date.now();
    }
  }

  getExecution(id: string): TaskExecution | undefined {
    return this.executions.get(id);
  }

  getAllExecutions(): TaskExecution[] {
    return Array.from(this.executions.values());
  }

  getRunningExecutions(): TaskExecution[] {
    return Array.from(this.executions.values()).filter(e => e.status === 'running');
  }
}
