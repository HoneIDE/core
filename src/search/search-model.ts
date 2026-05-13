/**
 * Search model — types and logic for workspace-wide text search.
 *
 * Provides both literal and regex search with case sensitivity toggle,
 * whole-word matching, and result grouping by file.
 */

export interface SearchMatch {
  line: number;          // 1-based line number
  column: number;        // 0-based column offset
  length: number;        // match length
  lineText: string;      // full line text
}

export interface FileSearchResult {
  filePath: string;
  matches: SearchMatch[];
}

export interface SearchOptions {
  caseSensitive: boolean;
  regex: boolean;
  wholeWord: boolean;
  maxResults: number;       // cap total matches
  maxFileSize: number;      // skip files larger than this (bytes)
  /**
   * SHIP-V1-GAPS.md #81 — when set, restrict matches to this 1-based line
   * range. `scopeStartLine === 0` (or `scopeEndLine < scopeStartLine`) means
   * "no scope" — search the whole document. Honored by `searchFileContent`
   * for in-editor "find in selection" workflows.
   */
  scopeStartLine?: number;
  scopeEndLine?: number;
}

export const DEFAULT_SEARCH_OPTIONS: SearchOptions = {
  caseSensitive: false,
  regex: false,
  wholeWord: false,
  maxResults: 1000,
  maxFileSize: 1024 * 1024,  // 1MB
  scopeStartLine: 0,
  scopeEndLine: 0,
};

/**
 * Search a single file's content for matches.
 * Returns null if no matches found.
 */
export function searchFileContent(
  content: string,
  query: string,
  options: SearchOptions,
): SearchMatch[] | null {
  if (query.length === 0) return null;

  let pattern: RegExp;
  try {
    if (options.regex) {
      const flags = options.caseSensitive ? 'g' : 'gi';
      let src = query;
      if (options.wholeWord) {
        src = `\\b${src}\\b`;
      }
      pattern = new RegExp(src, flags);
    } else {
      // Escape regex special chars for literal search
      const escaped = query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const flags = options.caseSensitive ? 'g' : 'gi';
      let src = escaped;
      if (options.wholeWord) {
        src = `\\b${src}\\b`;
      }
      pattern = new RegExp(src, flags);
    }
  } catch {
    return null; // invalid regex
  }

  const matches: SearchMatch[] = [];
  const lines = content.split('\n');

  // SHIP-V1-GAPS.md #81: in-selection scope clamps the iteration range.
  // Scope is 1-based; convert to 0-based array indices, clamp to bounds.
  // An invalid scope (missing/zero start, or end < start) means "no scope".
  let scopeStart = 0;
  let scopeEnd = lines.length;
  const sLine = options.scopeStartLine ?? 0;
  const eLine = options.scopeEndLine ?? 0;
  if (sLine > 0 && eLine >= sLine) {
    scopeStart = sLine - 1;
    scopeEnd = Math.min(eLine, lines.length);
  }

  for (let i = scopeStart; i < scopeEnd; i++) {
    const lineText = lines[i];
    pattern.lastIndex = 0;
    let match: RegExpExecArray | null;

    while ((match = pattern.exec(lineText)) !== null) {
      matches.push({
        line: i + 1,
        column: match.index,
        length: match[0].length,
        lineText,
      });

      if (matches.length >= options.maxResults) {
        return matches;
      }

      // Prevent infinite loop on zero-length matches
      if (match[0].length === 0) {
        pattern.lastIndex++;
      }
    }
  }

  return matches.length > 0 ? matches : null;
}

/**
 * Group flat matches into per-file results.
 */
export function groupByFile(results: FileSearchResult[]): Map<string, SearchMatch[]> {
  const map = new Map<string, SearchMatch[]>();
  for (const r of results) {
    map.set(r.filePath, r.matches);
  }
  return map;
}

/**
 * Count total matches across all file results.
 */
export function totalMatchCount(results: FileSearchResult[]): number {
  let count = 0;
  for (const r of results) {
    count += r.matches.length;
  }
  return count;
}

/**
 * Compute a replacement preview for a single file.
 * Returns the new content with all occurrences replaced.
 */
export function computeReplace(
  content: string,
  query: string,
  replacement: string,
  options: SearchOptions,
): string {
  if (query.length === 0) return content;

  let pattern: RegExp;
  try {
    if (options.regex) {
      const flags = options.caseSensitive ? 'g' : 'gi';
      let src = query;
      if (options.wholeWord) src = `\\b${src}\\b`;
      pattern = new RegExp(src, flags);
    } else {
      const escaped = query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const flags = options.caseSensitive ? 'g' : 'gi';
      let src = escaped;
      if (options.wholeWord) src = `\\b${src}\\b`;
      pattern = new RegExp(src, flags);
    }
  } catch {
    return content;
  }

  return content.replace(pattern, replacement);
}

/** Text file extensions to include in workspace search. */
export const TEXT_EXTENSIONS = new Set([
  '.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs',
  '.json', '.md', '.css', '.scss', '.less', '.html', '.htm',
  '.rs', '.py', '.rb', '.go', '.java', '.kt', '.swift',
  '.c', '.cpp', '.h', '.hpp', '.cs',
  '.toml', '.yaml', '.yml', '.xml',
  '.txt', '.sh', '.bash', '.zsh', '.fish',
  '.sql', '.graphql', '.proto',
  '.env', '.gitignore', '.dockerignore',
  '.vue', '.svelte', '.astro',
]);

/** Check if a filename has a text extension. */
export function isTextFile(name: string): boolean {
  const dot = name.lastIndexOf('.');
  if (dot < 0) return false;
  return TEXT_EXTENSIONS.has(name.slice(dot));
}

/** Directories to always skip in search. */
export const SKIP_DIRS = new Set([
  'node_modules', '.git', '.hg', '.svn',
  'dist', 'build', 'out', '.next', '.nuxt',
  'target', '__pycache__', '.cache',
  'coverage', '.nyc_output',
]);
