import type { ToolResult } from './file-tools';

export function terminalRun(command: string, root: string): ToolResult {
  if (!command) return { success: false, output: '', error: 'Empty command' };
  // Sanitize: block dangerous commands
  const blocked = ['rm -rf /', 'mkfs', 'dd if=', ':(){:|:&};:'];
  for (const b of blocked) {
    if (command.includes(b)) {
      return { success: false, output: '', error: 'Blocked dangerous command' };
    }
  }
  return { success: true, output: `[would run: ${command} in ${root}]` };
}

export function terminalRead(sessionId: string): ToolResult {
  return { success: true, output: `[would read terminal ${sessionId}]` };
}
