/**
 * Fuzzy file finder — in-memory index for fast Ctrl+P / Quick Open.
 *
 * Stores all file paths in the workspace and supports fuzzy matching
 * with scoring. The scoring algorithm rewards:
 * - Consecutive character matches
 * - Matches at word boundaries (after '/', '.', '-', '_')
 * - Matches at the start of the filename
 * - Shorter paths (less noise)
 *
 * The index is rebuilt when workspace roots change. Individual file
 * additions/removals are supported for incremental updates from
 * the file watcher.
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface FileMatch {
  /** Relative file path (from workspace root). */
  path: string;
  /** Filename portion only. */
  filename: string;
  /** Match score (higher = better match). 0 = no match. */
  score: number;
  /** Indices of matched characters in the path (for highlighting). */
  matchIndices: number[];
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const SCORE_CONSECUTIVE_BONUS = 5;
const SCORE_BOUNDARY_BONUS = 10;
const SCORE_FILENAME_START_BONUS = 15;
const SCORE_EXACT_FILENAME_BONUS = 25;
const SCORE_BASE_CHAR_MATCH = 1;
const SCORE_PATH_LENGTH_PENALTY = 0.5;

const BOUNDARY_CHARS = new Set(['/', '\\', '.', '-', '_', ' ']);

const MAX_RESULTS = 50;

// ---------------------------------------------------------------------------
// FileIndex
// ---------------------------------------------------------------------------

export class FileIndex {
  private _paths: string[] = [];
  private _pathSet: Set<string> = new Set();
  /** Cache of lowercased paths for case-insensitive matching. */
  private _lowerPaths: string[] = [];

  // -----------------------------------------------------------------------
  // Index management
  // -----------------------------------------------------------------------

  /**
   * Set the full list of file paths (replaces existing index).
   * Paths should be relative to workspace root.
   */
  setFiles(paths: string[]): void {
    this._paths = paths.slice();
    this._pathSet = new Set(paths);
    this._lowerPaths = paths.map(p => p.toLowerCase());
  }

  /**
   * Add a single file path to the index.
   */
  addFile(path: string): void {
    if (this._pathSet.has(path)) return;
    this._paths.push(path);
    this._pathSet.add(path);
    this._lowerPaths.push(path.toLowerCase());
  }

  /**
   * Remove a single file path from the index.
   */
  removeFile(path: string): void {
    if (!this._pathSet.has(path)) return;
    this._pathSet.delete(path);
    const idx = this._paths.indexOf(path);
    if (idx !== -1) {
      this._paths.splice(idx, 1);
      this._lowerPaths.splice(idx, 1);
    }
  }

  /**
   * Number of files in the index.
   */
  get size(): number {
    return this._paths.length;
  }

  /**
   * Check if a path is in the index.
   */
  has(path: string): boolean {
    return this._pathSet.has(path);
  }

  /**
   * Clear the index.
   */
  clear(): void {
    this._paths = [];
    this._pathSet.clear();
    this._lowerPaths = [];
  }

  // -----------------------------------------------------------------------
  // Fuzzy search
  // -----------------------------------------------------------------------

  /**
   * Search the index with a fuzzy query string.
   * Returns matches sorted by score (best first), limited to MAX_RESULTS.
   */
  search(query: string, maxResults: number = MAX_RESULTS): FileMatch[] {
    if (!query) {
      // Empty query → return recently-added files (last N)
      return this._paths.slice(-maxResults).reverse().map(p => ({
        path: p,
        filename: getFilename(p),
        score: 0,
        matchIndices: [],
      }));
    }

    const lowerQuery = query.toLowerCase();
    const results: FileMatch[] = [];

    for (let i = 0; i < this._paths.length; i++) {
      const match = this._matchPath(this._paths[i], this._lowerPaths[i], lowerQuery);
      if (match) {
        results.push(match);
      }
    }

    // Sort by score descending, then by path length ascending (tiebreaker)
    results.sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score;
      return a.path.length - b.path.length;
    });

    return results.slice(0, maxResults);
  }

  // -----------------------------------------------------------------------
  // Matching algorithm
  // -----------------------------------------------------------------------

  private _matchPath(
    path: string,
    lowerPath: string,
    lowerQuery: string,
  ): FileMatch | null {
    const matchIndices: number[] = [];
    let score = 0;
    let queryIdx = 0;
    let prevMatchIdx = -2; // -2 so first match isn't counted as consecutive

    const filename = getFilename(path);
    const filenameStart = path.length - filename.length;

    // Check for exact filename match first (huge bonus)
    const lowerFilename = filename.toLowerCase();
    if (lowerFilename === lowerQuery) {
      return {
        path,
        filename,
        score: SCORE_EXACT_FILENAME_BONUS * lowerQuery.length + 100,
        matchIndices: Array.from({ length: lowerQuery.length }, (_, i) => filenameStart + i),
      };
    }

    for (let pathIdx = 0; pathIdx < lowerPath.length && queryIdx < lowerQuery.length; pathIdx++) {
      if (lowerPath[pathIdx] === lowerQuery[queryIdx]) {
        matchIndices.push(pathIdx);

        // Base score for matching a character
        score += SCORE_BASE_CHAR_MATCH;

        // Consecutive match bonus
        if (pathIdx === prevMatchIdx + 1) {
          score += SCORE_CONSECUTIVE_BONUS;
        }

        // Word boundary bonus (match after /, ., -, _, space)
        if (pathIdx === 0 || BOUNDARY_CHARS.has(path[pathIdx - 1])) {
          score += SCORE_BOUNDARY_BONUS;
        }

        // Filename start bonus (match at the beginning of the filename)
        if (pathIdx === filenameStart) {
          score += SCORE_FILENAME_START_BONUS;
        }

        prevMatchIdx = pathIdx;
        queryIdx++;
      }
    }

    // All query characters must match
    if (queryIdx < lowerQuery.length) {
      return null;
    }

    // Penalize long paths (shorter = likely more relevant)
    score -= path.length * SCORE_PATH_LENGTH_PENALTY;

    // Ensure score is at least 1 for any match
    score = Math.max(1, score);

    return { path, filename, score, matchIndices };
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function getFilename(path: string): string {
  const lastSlash = Math.max(path.lastIndexOf('/'), path.lastIndexOf('\\'));
  return lastSlash === -1 ? path : path.substring(lastSlash + 1);
}
