import type { ToolResult } from './file-tools';

export function gitStatus(root: string): ToolResult {
  return { success: true, output: `[would run git status in ${root}]` };
}

export function gitDiff(root: string, cached?: boolean): ToolResult {
  const flag = cached ? ' --cached' : '';
  return { success: true, output: `[would run git diff${flag} in ${root}]` };
}

export function gitCommit(message: string, root: string): ToolResult {
  if (!message) return { success: false, output: '', error: 'Empty commit message' };
  return { success: true, output: `[would commit: "${message}" in ${root}]` };
}
