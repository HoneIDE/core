/**
 * Extension API implementation — maps @honeide/api surface to core services.
 *
 * Built-in language support configuration — separate from the v2 plugin
 * system (hone-extension/). Provides command registry, status bar, diagnostics,
 * and output channels for the built-in language bundles.
 */
export interface CommandRegistry {
  commands: Map<string, (...args: any[]) => any>;
  register(id: string, handler: (...args: any[]) => any): void;
  execute(id: string, ...args: any[]): any;
  has(id: string): boolean;
  getAll(): string[];
}

export function createCommandRegistry(): CommandRegistry {
  const commands = new Map<string, (...args: any[]) => any>();
  return {
    commands,
    register(id: string, handler: (...args: any[]) => any) {
      commands.set(id, handler);
    },
    execute(id: string, ...args: any[]) {
      const handler = commands.get(id);
      if (!handler) throw new Error(`Command not found: ${id}`);
      return handler(...args);
    },
    has(id: string) {
      return commands.has(id);
    },
    getAll() {
      return Array.from(commands.keys());
    },
  };
}

export interface StatusBarItem {
  id: string;
  text: string;
  tooltip: string;
  alignment: 'left' | 'right';
  priority: number;
  visible: boolean;
}

export function createStatusBarItem(id: string, alignment: 'left' | 'right' = 'left', priority: number = 0): StatusBarItem {
  return { id, text: '', tooltip: '', alignment, priority, visible: true };
}

export interface DiagnosticCollection {
  name: string;
  entries: Map<string, { line: number; message: string; severity: 'error' | 'warning' | 'info' | 'hint' }[]>;
  set(uri: string, diagnostics: { line: number; message: string; severity: 'error' | 'warning' | 'info' | 'hint' }[]): void;
  get(uri: string): { line: number; message: string; severity: 'error' | 'warning' | 'info' | 'hint' }[];
  delete(uri: string): void;
  clear(): void;
}

export function createDiagnosticCollection(name: string): DiagnosticCollection {
  const entries = new Map<string, { line: number; message: string; severity: 'error' | 'warning' | 'info' | 'hint' }[]>();
  return {
    name,
    entries,
    set(uri, diagnostics) { entries.set(uri, diagnostics); },
    get(uri) { return entries.get(uri) ?? []; },
    delete(uri) { entries.delete(uri); },
    clear() { entries.clear(); },
  };
}

export interface OutputChannel {
  name: string;
  lines: string[];
  append(text: string): void;
  appendLine(text: string): void;
  clear(): void;
}

export function createOutputChannel(name: string): OutputChannel {
  const lines: string[] = [];
  return {
    name,
    lines,
    append(text) {
      if (lines.length === 0) lines.push(text);
      else lines[lines.length - 1] += text;
    },
    appendLine(text) { lines.push(text); },
    clear() { lines.length = 0; },
  };
}
