import type { ToolResult } from './file-tools';

export function searchText(query: string, root: string, options?: { caseSensitive?: boolean; regex?: boolean }): ToolResult {
  if (!query) return { success: false, output: '', error: 'Empty query' };
  return { success: true, output: `[would search "${query}" in ${root}]` };
}

export function searchFiles(pattern: string, root: string): ToolResult {
  if (!pattern) return { success: false, output: '', error: 'Empty pattern' };
  return { success: true, output: `[would find files matching "${pattern}" in ${root}]` };
}
