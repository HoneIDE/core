import { fileRead, fileEdit, fileCreate, fileDelete, fileRename } from './file-tools';
import { searchText, searchFiles } from './search-tools';
import { gitStatus, gitDiff, gitCommit } from './git-tools';
import { terminalRun, terminalRead } from './shell-tools';
import { webFetch } from './web-tools';
import type { ToolResult } from './file-tools';
export type { ToolResult } from './file-tools';

export function executeTool(name: string, args: Record<string, unknown>, root: string): ToolResult {
  switch (name) {
    case 'file_read': return fileRead(args.path as string, root);
    case 'file_edit': return fileEdit(args.path as string, args.old_text as string, args.new_text as string, root);
    case 'file_create': return fileCreate(args.path as string, args.content as string, root);
    case 'file_delete': return fileDelete(args.path as string, root);
    case 'file_rename': return fileRename(args.old_path as string, args.new_path as string, root);
    case 'search_text': return searchText(args.query as string, root, args.options as any);
    case 'search_files': return searchFiles(args.pattern as string, root);
    case 'git_status': return gitStatus(root);
    case 'git_diff': return gitDiff(root, args.cached as boolean);
    case 'git_commit': return gitCommit(args.message as string, root);
    case 'terminal_run': return terminalRun(args.command as string, root);
    case 'terminal_read': return terminalRead(args.session_id as string);
    case 'web_fetch': return webFetch(args.url as string);
    default: return { success: false, output: '', error: `Unknown tool: ${name}` };
  }
}
