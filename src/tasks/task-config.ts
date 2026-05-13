/**
 * Task configuration types — tasks.json format.
 */
export interface TaskDefinition {
  label: string;
  type: 'shell' | 'process';
  command: string;
  args?: string[];
  group?: 'build' | 'test' | 'none';
  isDefault?: boolean;
  cwd?: string;
  env?: Record<string, string>;
  problemMatcher?: string | string[];
  presentation?: {
    reveal: 'always' | 'silent' | 'never';
    panel: 'shared' | 'dedicated' | 'new';
  };
}

export interface TasksConfig {
  version: string;
  tasks: TaskDefinition[];
}

export function parseTaskConfig(json: string): TasksConfig {
  const data = JSON.parse(json);
  return {
    version: data.version ?? '2.0.0',
    tasks: (data.tasks ?? []).map((t: any) => ({
      label: t.label ?? 'Unnamed',
      type: t.type ?? 'shell',
      command: t.command ?? '',
      args: t.args,
      group: t.group?.kind ?? t.group ?? 'none',
      isDefault: t.group?.isDefault ?? t.isDefault ?? false,
      cwd: t.cwd,
      env: t.env,
      problemMatcher: t.problemMatcher,
      presentation: t.presentation,
    })),
  };
}

export function findDefaultTask(config: TasksConfig, group: 'build' | 'test'): TaskDefinition | undefined {
  return config.tasks.find(t => t.group === group && t.isDefault);
}

export function getTasksByGroup(config: TasksConfig, group: 'build' | 'test' | 'none'): TaskDefinition[] {
  return config.tasks.filter(t => t.group === group);
}
