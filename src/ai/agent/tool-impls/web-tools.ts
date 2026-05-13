import type { ToolResult } from './file-tools';

export function webFetch(url: string): ToolResult {
  if (!url) return { success: false, output: '', error: 'Empty URL' };
  if (!url.startsWith('http://') && !url.startsWith('https://')) {
    return { success: false, output: '', error: 'Invalid URL scheme' };
  }
  return { success: true, output: `[would fetch ${url}]` };
}
