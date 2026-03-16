/**
 * Spell checker — checks words against a dictionary.
 *
 * Operates on extracted words from comments and strings.
 * Uses a Set for O(1) lookup against a bundled English word list.
 */

import { COMMON_WORDS } from './dictionary';

/** A misspelled word with its location. */
export interface SpellError {
  word: string;
  line: number;
  column: number;
  length: number;
  suggestions: string[];
}

/**
 * The spell checker.
 *
 * By default, loads the bundled common English dictionary.
 * Users can add custom words per-workspace or per-user.
 */
export class SpellChecker {
  private dictionary: Set<string>;
  private customWords: Set<string>;
  private enabled: boolean;

  constructor() {
    this.dictionary = new Set<string>();
    this.customWords = new Set<string>();
    this.enabled = true;
    this.loadDefaultDictionary();
  }

  private loadDefaultDictionary(): void {
    for (const word of COMMON_WORDS) {
      this.dictionary.add(word.toLowerCase());
    }
  }

  /** Add a custom word (won't be flagged as misspelled). */
  addWord(word: string): void {
    this.customWords.add(word.toLowerCase());
  }

  /** Remove a custom word. */
  removeWord(word: string): void {
    this.customWords.delete(word.toLowerCase());
  }

  /** Check if a word is correctly spelled. */
  isCorrect(word: string): boolean {
    if (word.length <= 1) return true;
    // All-uppercase words (acronyms) are always correct
    if (word === word.toUpperCase() && word.length <= 6) return true;
    // Numbers are always correct
    if (/^\d+$/.test(word)) return true;

    const lower = word.toLowerCase();
    return this.dictionary.has(lower) || this.customWords.has(lower);
  }

  /** Extract words from a line of text. */
  extractWords(line: string): Array<{ word: string; column: number }> {
    const results: Array<{ word: string; column: number }> = [];
    let wordStart = -1;

    for (let i = 0; i <= line.length; i++) {
      const ch = i < line.length ? line.charCodeAt(i) : 0;
      const isWordChar = (ch >= 65 && ch <= 90) || (ch >= 97 && ch <= 122) || ch === 39; // A-Z, a-z, apostrophe

      if (isWordChar && wordStart < 0) {
        wordStart = i;
      } else if (!isWordChar && wordStart >= 0) {
        const word = line.slice(wordStart, i);
        // Split camelCase: "getUser" → ["get", "User"]
        const parts = splitCamelCase(word);
        let col = wordStart;
        for (const part of parts) {
          if (part.length > 1) {
            results.push({ word: part, column: col });
          }
          col += part.length;
        }
        wordStart = -1;
      }
    }

    return results;
  }

  /**
   * Check a line of text for spelling errors.
   * Only checks words, skipping those in the dictionary.
   */
  checkLine(line: string, lineNumber: number): SpellError[] {
    if (!this.enabled) return [];

    const errors: SpellError[] = [];
    const words = this.extractWords(line);

    for (const { word, column } of words) {
      if (!this.isCorrect(word)) {
        errors.push({
          word,
          line: lineNumber,
          column,
          length: word.length,
          suggestions: this.suggest(word),
        });
      }
    }

    return errors;
  }

  /** Generate simple suggestions for a misspelled word. */
  suggest(word: string): string[] {
    const lower = word.toLowerCase();
    const suggestions: string[] = [];

    // Try common transpositions
    for (let i = 0; i < lower.length - 1 && suggestions.length < 3; i++) {
      const swapped = lower.slice(0, i) + lower[i + 1] + lower[i] + lower.slice(i + 2);
      if (this.dictionary.has(swapped)) {
        suggestions.push(swapped);
      }
    }

    // Try single character deletion
    for (let i = 0; i < lower.length && suggestions.length < 3; i++) {
      const deleted = lower.slice(0, i) + lower.slice(i + 1);
      if (this.dictionary.has(deleted)) {
        suggestions.push(deleted);
      }
    }

    return suggestions;
  }

  /** Enable or disable the spell checker. */
  setEnabled(enabled: boolean): void {
    this.enabled = enabled;
  }

  /** Get dictionary size (for diagnostics). */
  getDictionarySize(): number {
    return this.dictionary.size;
  }
}

/** Split a camelCase or PascalCase word into parts. */
function splitCamelCase(word: string): string[] {
  const parts: string[] = [];
  let start = 0;
  for (let i = 1; i < word.length; i++) {
    const ch = word.charCodeAt(i);
    if (ch >= 65 && ch <= 90) { // uppercase
      parts.push(word.slice(start, i));
      start = i;
    }
  }
  parts.push(word.slice(start));
  return parts;
}
