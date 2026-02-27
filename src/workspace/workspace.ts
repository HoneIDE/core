/**
 * Multi-root workspace management.
 *
 * A workspace is a collection of root folders that the user has opened.
 * Single-folder mode is a workspace with one root. Multi-root workspaces
 * can have multiple root folders (like a monorepo with separate projects).
 *
 * The workspace tracks:
 * - Root folders and their filesystem entries
 * - Workspace-level configuration (.hone/ directory)
 * - Active/open state
 */

import { readdir, stat, mkdir } from 'node:fs/promises';
import { join, basename, relative, sep } from 'node:path';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface WorkspaceFolder {
  /** Absolute path to the folder root. */
  path: string;
  /** Display name (basename of path, or custom name). */
  name: string;
  /** Index in the workspace (for ordering). */
  index: number;
}

export interface FileEntry {
  /** File/directory name (not full path). */
  name: string;
  /** Absolute path. */
  path: string;
  /** Relative path from workspace root. */
  relativePath: string;
  type: 'file' | 'directory' | 'symlink';
  /** Size in bytes (0 for directories). */
  size: number;
  /** Last modified timestamp (ms since epoch). */
  mtime: number;
  /** Children (populated for directories when expanded). */
  children: FileEntry[] | null;
}

export type WorkspaceEventType =
  | 'folder-added'
  | 'folder-removed'
  | 'files-changed'
  | 'workspace-opened'
  | 'workspace-closed';

export interface WorkspaceEvent {
  type: WorkspaceEventType;
  folder?: WorkspaceFolder;
  paths?: string[];
}

// ---------------------------------------------------------------------------
// Ignore patterns
// ---------------------------------------------------------------------------

const DEFAULT_IGNORE_PATTERNS = new Set([
  'node_modules',
  '.git',
  '.hg',
  '.svn',
  '.DS_Store',
  'Thumbs.db',
  '__pycache__',
  '.pytest_cache',
  '.mypy_cache',
  'dist',
  'build',
  '.next',
  '.nuxt',
  'target',          // Rust
  '.gradle',
  '.idea',
  '.vscode',
]);

// ---------------------------------------------------------------------------
// Workspace
// ---------------------------------------------------------------------------

type WorkspaceListener = (event: WorkspaceEvent) => void;

export class Workspace {
  private _folders: WorkspaceFolder[] = [];
  private _listeners: Set<WorkspaceListener> = new Set();
  private _ignorePatterns: Set<string>;
  private _isOpen = false;

  constructor(ignorePatterns?: Set<string>) {
    this._ignorePatterns = ignorePatterns ?? new Set(DEFAULT_IGNORE_PATTERNS);
  }

  // -----------------------------------------------------------------------
  // Queries
  // -----------------------------------------------------------------------

  get isOpen(): boolean {
    return this._isOpen;
  }

  get folders(): readonly WorkspaceFolder[] {
    return this._folders;
  }

  get folderCount(): number {
    return this._folders.length;
  }

  getFolder(index: number): WorkspaceFolder | undefined {
    return this._folders[index];
  }

  getFolderByPath(path: string): WorkspaceFolder | undefined {
    return this._folders.find(f => f.path === path);
  }

  /**
   * Check if a file path belongs to this workspace.
   */
  contains(filePath: string): boolean {
    return this._folders.some(f => filePath.startsWith(f.path + sep) || filePath === f.path);
  }

  /**
   * Get the workspace folder that contains a given file path.
   */
  getFolderForPath(filePath: string): WorkspaceFolder | undefined {
    return this._folders.find(f => filePath.startsWith(f.path + sep) || filePath === f.path);
  }

  /**
   * Get the relative path of a file within its workspace folder.
   */
  getRelativePath(filePath: string): string | null {
    const folder = this.getFolderForPath(filePath);
    if (!folder) return null;
    return relative(folder.path, filePath);
  }

  shouldIgnore(name: string): boolean {
    return this._ignorePatterns.has(name) || name.startsWith('.');
  }

  // -----------------------------------------------------------------------
  // Mutations
  // -----------------------------------------------------------------------

  /**
   * Add a root folder to the workspace.
   */
  addFolder(path: string, name?: string): WorkspaceFolder {
    // Don't add duplicates
    const existing = this.getFolderByPath(path);
    if (existing) return existing;

    const folder: WorkspaceFolder = {
      path,
      name: name ?? basename(path),
      index: this._folders.length,
    };
    this._folders.push(folder);
    this._isOpen = true;

    this._emit({ type: 'folder-added', folder });
    if (this._folders.length === 1) {
      this._emit({ type: 'workspace-opened' });
    }
    return folder;
  }

  /**
   * Remove a root folder from the workspace.
   */
  removeFolder(path: string): boolean {
    const idx = this._folders.findIndex(f => f.path === path);
    if (idx === -1) return false;

    const [folder] = this._folders.splice(idx, 1);
    // Re-index remaining folders
    for (let i = 0; i < this._folders.length; i++) {
      this._folders[i].index = i;
    }

    this._emit({ type: 'folder-removed', folder });
    if (this._folders.length === 0) {
      this._isOpen = false;
      this._emit({ type: 'workspace-closed' });
    }
    return true;
  }

  /**
   * Close the workspace (remove all folders).
   */
  close(): void {
    this._folders = [];
    this._isOpen = false;
    this._emit({ type: 'workspace-closed' });
  }

  // -----------------------------------------------------------------------
  // File system reading
  // -----------------------------------------------------------------------

  /**
   * Read the contents of a directory, returning sorted FileEntry objects.
   * Directories are listed first, then files, both alphabetically.
   */
  async readDirectory(dirPath: string): Promise<FileEntry[]> {
    const folder = this.getFolderForPath(dirPath);
    const rootPath = folder?.path ?? dirPath;

    const entries = await readdir(dirPath, { withFileTypes: true });
    const results: FileEntry[] = [];

    for (const entry of entries) {
      if (this.shouldIgnore(entry.name)) continue;

      const entryPath = join(dirPath, entry.name);
      let type: FileEntry['type'] = 'file';
      let size = 0;
      let mtime = 0;

      if (entry.isDirectory()) {
        type = 'directory';
      } else if (entry.isSymbolicLink()) {
        type = 'symlink';
      }

      try {
        const st = await stat(entryPath);
        size = st.size;
        mtime = st.mtimeMs;
        if (st.isDirectory()) type = 'directory';
      } catch {
        // Stat failed (broken symlink, permission error) — skip
        continue;
      }

      results.push({
        name: entry.name,
        path: entryPath,
        relativePath: relative(rootPath, entryPath),
        type,
        size,
        mtime,
        children: type === 'directory' ? null : null,
      });
    }

    // Sort: directories first, then alphabetical (case-insensitive)
    results.sort((a, b) => {
      if (a.type === 'directory' && b.type !== 'directory') return -1;
      if (a.type !== 'directory' && b.type === 'directory') return 1;
      return a.name.localeCompare(b.name, undefined, { sensitivity: 'base' });
    });

    return results;
  }

  /**
   * Recursively collect all file paths in a workspace folder.
   * Used to build the file index for fuzzy finding.
   * Respects ignore patterns and has a max depth to prevent runaway.
   */
  async collectAllFiles(
    rootPath: string,
    maxDepth: number = 20,
  ): Promise<string[]> {
    const files: string[] = [];
    await this._collectRecursive(rootPath, rootPath, files, 0, maxDepth);
    return files;
  }

  private async _collectRecursive(
    rootPath: string,
    dirPath: string,
    files: string[],
    depth: number,
    maxDepth: number,
  ): Promise<void> {
    if (depth >= maxDepth) return;

    let entries;
    try {
      entries = await readdir(dirPath, { withFileTypes: true });
    } catch {
      return; // Permission denied, etc.
    }

    for (const entry of entries) {
      if (this.shouldIgnore(entry.name)) continue;

      const fullPath = join(dirPath, entry.name);

      if (entry.isDirectory()) {
        await this._collectRecursive(rootPath, fullPath, files, depth + 1, maxDepth);
      } else if (entry.isFile() || entry.isSymbolicLink()) {
        files.push(relative(rootPath, fullPath));
      }
    }
  }

  // -----------------------------------------------------------------------
  // Listeners
  // -----------------------------------------------------------------------

  onEvent(listener: WorkspaceListener): () => void {
    this._listeners.add(listener);
    return () => { this._listeners.delete(listener); };
  }

  private _emit(event: WorkspaceEvent): void {
    for (const fn of this._listeners) fn(event);
  }
}
