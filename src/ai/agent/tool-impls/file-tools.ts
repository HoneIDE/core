export interface ToolResult {
  success: boolean;
  output: string;
  error?: string;
}

export function fileRead(path: string, root: string): ToolResult {
  // Validate path is under root
  const resolved = path.startsWith('/') ? path : root + '/' + path;
  if (!resolved.startsWith(root)) {
    return { success: false, output: '', error: 'Path outside workspace' };
  }
  return { success: true, output: `[would read ${resolved}]` };
}

export function fileEdit(path: string, oldText: string, newText: string, root: string): ToolResult {
  const resolved = path.startsWith('/') ? path : root + '/' + path;
  if (!resolved.startsWith(root)) {
    return { success: false, output: '', error: 'Path outside workspace' };
  }
  return { success: true, output: `[would edit ${resolved}: replace ${oldText.length} chars]` };
}

export function fileCreate(path: string, content: string, root: string): ToolResult {
  const resolved = path.startsWith('/') ? path : root + '/' + path;
  if (!resolved.startsWith(root)) {
    return { success: false, output: '', error: 'Path outside workspace' };
  }
  return { success: true, output: `[would create ${resolved}: ${content.length} chars]` };
}

export function fileDelete(path: string, root: string): ToolResult {
  const resolved = path.startsWith('/') ? path : root + '/' + path;
  if (!resolved.startsWith(root)) {
    return { success: false, output: '', error: 'Path outside workspace' };
  }
  return { success: true, output: `[would delete ${resolved}]` };
}

export function fileRename(oldPath: string, newPath: string, root: string): ToolResult {
  const resolvedOld = oldPath.startsWith('/') ? oldPath : root + '/' + oldPath;
  const resolvedNew = newPath.startsWith('/') ? newPath : root + '/' + newPath;
  if (!resolvedOld.startsWith(root) || !resolvedNew.startsWith(root)) {
    return { success: false, output: '', error: 'Path outside workspace' };
  }
  return { success: true, output: `[would rename ${resolvedOld} -> ${resolvedNew}]` };
}
