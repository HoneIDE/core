/**
 * Plan decomposition for AI agent tasks.
 * Breaks a user intent into discrete steps.
 */

export type PlanStepStatus = 'pending' | 'in_progress' | 'completed' | 'failed' | 'skipped';

export interface PlanStep {
  id: number;
  description: string;
  status: PlanStepStatus;
  /** Tool name this step will use (if known) */
  toolName?: string;
  /** Result summary (filled after execution) */
  result?: string;
}

let nextStepId = 1;

export class AgentPlan {
  private steps: PlanStep[] = [];
  private currentStepIndex = -1;

  /** Add a step to the plan. */
  addStep(description: string, toolName?: string): PlanStep {
    const step: PlanStep = {
      id: nextStepId++,
      description,
      status: 'pending',
      toolName,
    };
    this.steps.push(step);
    return step;
  }

  /** Set steps from a list of descriptions (replaces all). */
  setSteps(descriptions: string[]): void {
    this.steps.length = 0;
    this.currentStepIndex = -1;
    for (let i = 0; i < descriptions.length; i++) {
      this.addStep(descriptions[i]);
    }
  }

  /** Get all steps. */
  getSteps(): PlanStep[] {
    return this.steps.slice();
  }

  /** Get the current step. */
  getCurrentStep(): PlanStep | null {
    if (this.currentStepIndex < 0 || this.currentStepIndex >= this.steps.length) {
      return null;
    }
    return this.steps[this.currentStepIndex];
  }

  /** Advance to the next pending step. Returns the step or null if done. */
  advanceToNext(): PlanStep | null {
    for (let i = this.currentStepIndex + 1; i < this.steps.length; i++) {
      if (this.steps[i].status === 'pending') {
        this.currentStepIndex = i;
        this.steps[i].status = 'in_progress';
        return this.steps[i];
      }
    }
    return null;
  }

  /** Mark the current step as completed. */
  completeCurrentStep(result?: string): boolean {
    const step = this.getCurrentStep();
    if (!step || step.status !== 'in_progress') return false;
    step.status = 'completed';
    step.result = result;
    return true;
  }

  /** Mark the current step as failed. */
  failCurrentStep(result?: string): boolean {
    const step = this.getCurrentStep();
    if (!step || step.status !== 'in_progress') return false;
    step.status = 'failed';
    step.result = result;
    return true;
  }

  /** Skip a step by ID. */
  skipStep(id: number): boolean {
    for (let i = 0; i < this.steps.length; i++) {
      if (this.steps[i].id === id && this.steps[i].status === 'pending') {
        this.steps[i].status = 'skipped';
        return true;
      }
    }
    return false;
  }

  /** Reorder a step (move step at fromIndex to toIndex). */
  reorderStep(fromIndex: number, toIndex: number): boolean {
    if (fromIndex < 0 || fromIndex >= this.steps.length) return false;
    if (toIndex < 0 || toIndex >= this.steps.length) return false;
    if (fromIndex === toIndex) return false;

    const step = this.steps.splice(fromIndex, 1)[0];
    this.steps.splice(toIndex, 0, step);
    return true;
  }

  /** Check if all steps are completed or skipped. */
  isComplete(): boolean {
    for (let i = 0; i < this.steps.length; i++) {
      const s = this.steps[i].status;
      if (s === 'pending' || s === 'in_progress') return false;
    }
    return this.steps.length > 0;
  }

  /** Get completion progress as a fraction. */
  getProgress(): { completed: number; total: number } {
    let completed = 0;
    for (let i = 0; i < this.steps.length; i++) {
      const s = this.steps[i].status;
      if (s === 'completed' || s === 'skipped') completed++;
    }
    return { completed, total: this.steps.length };
  }

  /** Step count. */
  get stepCount(): number {
    return this.steps.length;
  }

  /** Clear the plan. */
  clear(): void {
    this.steps.length = 0;
    this.currentStepIndex = -1;
  }
}

/** Reset step ID counter (for testing). */
export function resetPlanIds(): void {
  nextStepId = 1;
}
