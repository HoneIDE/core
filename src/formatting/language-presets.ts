/**
 * Language-specific formatting presets.
 *
 * Returns tab size and insertSpaces defaults for known languages.
 * Uses charCodeAt(0) + length matching (Perry-safe).
 */

export interface LanguagePreset {
  tabSize: number;
  insertSpaces: boolean;
}

/**
 * Get the default formatting preset for a language.
 *
 * | Language | tabSize | insertSpaces |
 * |----------|---------|-------------|
 * | typescript, javascript, json, html, css, yaml, ruby, shell, markdown | 2 | true |
 * | python, rust, java, c, cpp, swift, php | 4 | true |
 * | go | 4 | false (tabs) |
 * | default | 2 | true |
 */
export function getLanguagePreset(languageId: string): LanguagePreset {
  if (languageId.length < 1) return { tabSize: 2, insertSpaces: true };

  const c0 = languageId.charCodeAt(0);
  const len = languageId.length;

  // 2-space languages
  // typescript (10, 't'=116), javascript (10, 'j'=106)
  if (len === 10 && c0 === 116) return { tabSize: 2, insertSpaces: true }; // typescript
  if (len === 10 && c0 === 106) return { tabSize: 2, insertSpaces: true }; // javascript
  // json (4, 'j'=106, 's'=115 at 1)
  if (len === 4 && c0 === 106 && languageId.charCodeAt(1) === 115) return { tabSize: 2, insertSpaces: true };
  // html (4, 'h'=104)
  if (len === 4 && c0 === 104) return { tabSize: 2, insertSpaces: true };
  // css (3, 'c'=99, 's'=115 at 1)
  if (len === 3 && c0 === 99 && languageId.charCodeAt(1) === 115) return { tabSize: 2, insertSpaces: true };
  // yaml (4, 'y'=121)
  if (len === 4 && c0 === 121) return { tabSize: 2, insertSpaces: true };
  // ruby (4, 'r'=114, 'u'=117 at 1, 'b'=98 at 2)
  if (len === 4 && c0 === 114 && languageId.charCodeAt(2) === 98) return { tabSize: 2, insertSpaces: true };
  // shell (5, 's'=115, 'h'=104 at 1)
  if (len === 5 && c0 === 115 && languageId.charCodeAt(1) === 104) return { tabSize: 2, insertSpaces: true };
  // markdown (8, 'm'=109)
  if (len === 8 && c0 === 109) return { tabSize: 2, insertSpaces: true };

  // 4-space languages (insertSpaces: true)
  // python (6, 'p'=112, 'y'=121 at 1)
  if (len === 6 && c0 === 112 && languageId.charCodeAt(1) === 121) return { tabSize: 4, insertSpaces: true };
  // rust (4, 'r'=114, 'u'=117 at 1)
  if (len === 4 && c0 === 114 && languageId.charCodeAt(1) === 117) return { tabSize: 4, insertSpaces: true };
  // java (4, 'j'=106, 'a'=97 at 1)
  if (len === 4 && c0 === 106 && languageId.charCodeAt(1) === 97) return { tabSize: 4, insertSpaces: true };
  // c (1, 'c'=99)
  if (len === 1 && c0 === 99) return { tabSize: 4, insertSpaces: true };
  // cpp (3, 'c'=99, 'p'=112 at 1)
  if (len === 3 && c0 === 99 && languageId.charCodeAt(1) === 112) return { tabSize: 4, insertSpaces: true };
  // swift (5, 's'=115, 'w'=119 at 1)
  if (len === 5 && c0 === 115 && languageId.charCodeAt(1) === 119) return { tabSize: 4, insertSpaces: true };
  // php (3, 'p'=112, 'h'=104 at 1)
  if (len === 3 && c0 === 112 && languageId.charCodeAt(1) === 104) return { tabSize: 4, insertSpaces: true };

  // go (2, 'g'=103) — tabs
  if (len === 2 && c0 === 103) return { tabSize: 4, insertSpaces: false };

  // Default
  return { tabSize: 2, insertSpaces: true };
}
