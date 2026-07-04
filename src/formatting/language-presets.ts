/**
 * Language-specific formatting presets.
 *
 * Returns tab size and insertSpaces defaults for known languages.
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
  switch (languageId) {
    case 'typescript':
    case 'javascript':
    case 'json':
    case 'html':
    case 'css':
    case 'yaml':
    case 'ruby':
    case 'shell':
    case 'markdown':
      return { tabSize: 2, insertSpaces: true };

    case 'python':
    case 'rust':
    case 'java':
    case 'c':
    case 'cpp':
    case 'swift':
    case 'php':
      return { tabSize: 4, insertSpaces: true };

    case 'go':
      return { tabSize: 4, insertSpaces: false }; // tabs

    default:
      return { tabSize: 2, insertSpaces: true };
  }
}
