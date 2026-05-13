/**
 * Ripgrep integration — builds rg command lines and parses JSON output.
 *
 * Provides a high-level interface for running ripgrep searches
 * and converting results to the SearchMatch format used by search-model.
 */
import type { SearchMatch } from './search-model';

export interface RipgrepOptions {
  caseSensitive?: boolean;
  wholeWord?: boolean;
  regex?: boolean;
  include?: string[];    // glob patterns to include
  exclude?: string[];    // glob patterns to exclude
  maxResults?: number;
}

/** Parsed ripgrep JSON match entry. */
interface RgJsonMatch {
  type: 'match';
  data: {
    path: { text: string };
    lines: { text: string };
    line_number: number;
    submatches: Array<{
      match: { text: string };
      start: number;
      end: number;
    }>;
  };
}

export class RipgrepSearcher {
  /**
   * Build rg command-line arguments for a given query and options.
   */
  buildArgs(query: string, options?: RipgrepOptions): string[] {
    const args: string[] = ['--json'];

    const opts = options ?? {};

    // Case sensitivity: rg is smart-case by default,
    // so we need to be explicit
    if (opts.caseSensitive) {
      args.push('--case-sensitive');
    } else {
      args.push('--ignore-case');
    }

    if (opts.wholeWord) {
      args.push('--word-regexp');
    }

    if (opts.regex) {
      // rg uses regex by default, but be explicit
      args.push('--regexp', query);
    } else {
      args.push('--fixed-strings', query);
    }

    if (opts.include) {
      for (const glob of opts.include) {
        args.push('--glob', glob);
      }
    }

    if (opts.exclude) {
      for (const glob of opts.exclude) {
        args.push('--glob', `!${glob}`);
      }
    }

    if (opts.maxResults !== undefined && opts.maxResults > 0) {
      args.push('--max-count', String(opts.maxResults));
    }

    return args;
  }

  /**
   * Parse ripgrep --json output into SearchMatch[] grouped by file.
   * Each line of output is a JSON object; we only care about type: "match".
   */
  static parseJsonLines(output: string): Map<string, SearchMatch[]> {
    const results = new Map<string, SearchMatch[]>();

    if (!output || output.trim().length === 0) {
      return results;
    }

    const lines = output.split('\n');
    for (const line of lines) {
      if (line.trim().length === 0) continue;

      let parsed: any;
      try {
        parsed = JSON.parse(line);
      } catch {
        continue;
      }

      if (parsed.type !== 'match') continue;

      const data = parsed.data;
      const filePath: string = data.path.text;
      const lineText: string = data.lines.text.replace(/\n$/, '');
      const lineNumber: number = data.line_number;

      if (!results.has(filePath)) {
        results.set(filePath, []);
      }
      const fileMatches = results.get(filePath)!;

      for (const sub of data.submatches) {
        fileMatches.push({
          line: lineNumber,
          column: sub.start,
          length: sub.end - sub.start,
          lineText,
        });
      }
    }

    return results;
  }

  /**
   * Run a search (builds command + parses output).
   * In a real implementation this would exec `rg`; here we provide
   * the method signature for integration.
   */
  search(query: string, rootPath: string, options?: RipgrepOptions): { args: string[]; cwd: string } {
    const args = this.buildArgs(query, options);
    args.push('--', rootPath);
    return { args, cwd: rootPath };
  }
}
