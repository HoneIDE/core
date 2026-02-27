/**
 * Keybinding resolution — chord support, when-clause evaluation.
 *
 * A keybinding maps a key chord to a command, optionally gated by a when-clause.
 * Chords are sequences of two key presses (e.g. Ctrl+K Ctrl+C).
 *
 * Key format: modifier+modifier+key
 *   Modifiers: ctrl, cmd, shift, alt, meta
 *   Key: a-z, 0-9, f1-f12, escape, enter, tab, backspace, delete,
 *        up, down, left, right, home, end, pageup, pagedown, space, ...
 *
 * When-clauses: simple boolean expressions
 *   Atoms: contextKey (truthy), contextKey == 'value', contextKey != 'value'
 *   Operators: &&, ||, !
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface KeybindingDefinition {
  key: string;            // e.g. "ctrl+shift+p" or "ctrl+k ctrl+c" (chord)
  command: string;        // e.g. "workbench.action.showCommands"
  when?: string;          // e.g. "editorTextFocus && !editorReadonly"
  args?: unknown;         // optional arguments passed to the command
}

export interface ParsedKey {
  ctrl: boolean;
  cmd: boolean;
  shift: boolean;
  alt: boolean;
  meta: boolean;
  key: string;            // normalized key name (lowercase)
}

export interface ParsedChord {
  first: ParsedKey;
  second?: ParsedKey;     // defined for two-part chords
}

export interface ResolvedKeybinding {
  chord: ParsedChord;
  command: string;
  when?: string;
  args?: unknown;
}

// ---------------------------------------------------------------------------
// Key parsing
// ---------------------------------------------------------------------------

const MODIFIER_ALIASES: Record<string, keyof Omit<ParsedKey, 'key'>> = {
  ctrl: 'ctrl',
  control: 'ctrl',
  cmd: 'cmd',
  command: 'cmd',
  shift: 'shift',
  alt: 'alt',
  option: 'alt',
  meta: 'meta',
  win: 'meta',
  super: 'meta',
};

const KEY_ALIASES: Record<string, string> = {
  ' ': 'space',
  '\t': 'tab',
  '\n': 'enter',
  '\r': 'enter',
  oem_period: '.',
  oem_comma: ',',
  oem_minus: '-',
  oem_plus: '+',
};

/** Parse a single key expression like "ctrl+shift+k" into a ParsedKey. */
export function parseKey(expr: string): ParsedKey {
  const parts = expr.toLowerCase().trim().split('+').filter(p => p.length > 0);
  const result: ParsedKey = { ctrl: false, cmd: false, shift: false, alt: false, meta: false, key: '' };

  for (const part of parts) {
    const mod = MODIFIER_ALIASES[part];
    if (mod) {
      result[mod] = true;
    } else {
      result.key = KEY_ALIASES[part] ?? part;
    }
  }

  return result;
}

/** Parse a chord expression (one or two key presses) into a ParsedChord. */
export function parseChord(expr: string): ParsedChord {
  // Split on space, but not inside modifier sequences
  // Chord: "ctrl+k ctrl+c" → two parts
  const trimmed = expr.trim();
  const parts = splitChordParts(trimmed);

  if (parts.length === 1) {
    return { first: parseKey(parts[0]) };
  }
  return { first: parseKey(parts[0]), second: parseKey(parts[1]) };
}

/** Split "ctrl+k ctrl+c" into ["ctrl+k", "ctrl+c"]. */
function splitChordParts(expr: string): string[] {
  // Find the space that separates chord parts (not within modifier sequences)
  // Simple heuristic: split on spaces that are NOT adjacent to '+'
  const trimmed = expr.trim();
  const spaceIdx = trimmed.indexOf(' ');
  if (spaceIdx < 0) return [trimmed];
  return [trimmed.slice(0, spaceIdx), trimmed.slice(spaceIdx + 1)];
}

/** Serialize a ParsedKey back to a normalized string. */
export function keyToString(key: ParsedKey): string {
  const mods: string[] = [];
  if (key.ctrl) mods.push('ctrl');
  if (key.cmd) mods.push('cmd');
  if (key.shift) mods.push('shift');
  if (key.alt) mods.push('alt');
  if (key.meta) mods.push('meta');
  mods.push(key.key);
  return mods.join('+');
}

/** Check if two ParsedKeys match. */
export function keysMatch(a: ParsedKey, b: ParsedKey): boolean {
  return a.ctrl === b.ctrl && a.cmd === b.cmd && a.shift === b.shift &&
         a.alt === b.alt && a.meta === b.meta && a.key === b.key;
}

// ---------------------------------------------------------------------------
// When-clause evaluation
// ---------------------------------------------------------------------------

export type WhenContext = Record<string, unknown>;

/** Evaluate a simple when-clause against a context. */
export function evaluateWhen(when: string | undefined, ctx: WhenContext): boolean {
  if (!when) return true;
  try {
    return evaluateExpr(when.trim(), ctx);
  } catch {
    return false;
  }
}

function evaluateExpr(expr: string, ctx: WhenContext): boolean {
  // Strip outer parentheses
  const stripped = stripOuterParens(expr.trim());
  if (stripped !== expr.trim()) return evaluateExpr(stripped, ctx);

  // OR — lowest precedence
  const orIdx = findOperator(stripped, '||');
  if (orIdx >= 0) {
    return evaluateExpr(stripped.slice(0, orIdx).trim(), ctx) ||
           evaluateExpr(stripped.slice(orIdx + 2).trim(), ctx);
  }

  // AND
  const andIdx = findOperator(stripped, '&&');
  if (andIdx >= 0) {
    return evaluateExpr(stripped.slice(0, andIdx).trim(), ctx) &&
           evaluateExpr(stripped.slice(andIdx + 2).trim(), ctx);
  }

  // NOT
  if (stripped.startsWith('!') && !stripped.startsWith('!=')) {
    return !evaluateExpr(stripped.slice(1).trim(), ctx);
  }

  // Equality
  const eqIdx = stripped.indexOf('==');
  if (eqIdx >= 0) {
    const key = stripped.slice(0, eqIdx).trim();
    const val = stripped.slice(eqIdx + 2).trim().replace(/^['"]|['"]$/g, '');
    return String(ctx[key] ?? '') === val;
  }

  // Inequality
  const neqIdx = stripped.indexOf('!=');
  if (neqIdx >= 0) {
    const key = stripped.slice(0, neqIdx).trim();
    const val = stripped.slice(neqIdx + 2).trim().replace(/^['"]|['"]$/g, '');
    return String(ctx[key] ?? '') !== val;
  }

  // Simple truthy check
  return Boolean(ctx[stripped]);
}

/** Find the index of an operator NOT inside parentheses. */
function findOperator(expr: string, op: string): number {
  let depth = 0;
  for (let i = 0; i < expr.length - op.length + 1; i++) {
    if (expr[i] === '(') { depth++; continue; }
    if (expr[i] === ')') { depth--; continue; }
    if (depth === 0 && expr.slice(i, i + op.length) === op) return i;
  }
  return -1;
}

function stripOuterParens(expr: string): string {
  if (!expr.startsWith('(') || !expr.endsWith(')')) return expr;
  let depth = 0;
  for (let i = 0; i < expr.length; i++) {
    if (expr[i] === '(') depth++;
    if (expr[i] === ')') depth--;
    if (depth === 0 && i < expr.length - 1) return expr; // balanced before the end
  }
  return expr.slice(1, -1);
}

// ---------------------------------------------------------------------------
// Resolver
// ---------------------------------------------------------------------------

export class KeybindingResolver {
  private bindings: ResolvedKeybinding[] = [];
  private chordPending: ParsedKey | null = null;

  constructor(definitions: KeybindingDefinition[]) {
    this.bindings = definitions.map(def => ({
      chord: parseChord(def.key),
      command: def.command,
      when: def.when,
      args: def.args,
    }));
  }

  /**
   * Resolve a key press against current context.
   * Returns the matched command+args, or null if no match.
   * Handles two-part chords: first press starts the chord, second resolves it.
   */
  resolve(key: ParsedKey, ctx: WhenContext): { command: string; args?: unknown } | null {
    if (this.chordPending) {
      // Try to complete a chord
      const match = this.findMatch(this.chordPending, key, ctx);
      this.chordPending = null;
      if (match) return { command: match.command, args: match.args };
      // If no chord match, fall through to single-key lookup
    }

    // Check for single-key bindings
    const single = this.findSingleMatch(key, ctx);
    if (single) return { command: single.command, args: single.args };

    // Check if this could be the start of a chord
    const hasChordStart = this.bindings.some(b => b.chord.second && keysMatch(b.chord.first, key));
    if (hasChordStart) {
      this.chordPending = key;
      return null; // Waiting for second key
    }

    return null;
  }

  /** Cancel any pending chord state. */
  cancelChord(): void {
    this.chordPending = null;
  }

  /** Check if a chord is currently pending. */
  isChordPending(): boolean {
    return this.chordPending !== null;
  }

  private findSingleMatch(key: ParsedKey, ctx: WhenContext): ResolvedKeybinding | null {
    // Search in reverse (later definitions override earlier ones)
    for (let i = this.bindings.length - 1; i >= 0; i--) {
      const b = this.bindings[i];
      if (!b.chord.second && keysMatch(b.chord.first, key) && evaluateWhen(b.when, ctx)) {
        return b;
      }
    }
    return null;
  }

  private findMatch(first: ParsedKey, second: ParsedKey, ctx: WhenContext): ResolvedKeybinding | null {
    for (let i = this.bindings.length - 1; i >= 0; i--) {
      const b = this.bindings[i];
      if (b.chord.second &&
          keysMatch(b.chord.first, first) &&
          keysMatch(b.chord.second, second) &&
          evaluateWhen(b.when, ctx)) {
        return b;
      }
    }
    return null;
  }
}
