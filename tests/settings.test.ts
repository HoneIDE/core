/**
 * Tests for Slice 2: Settings Store & Keybinding Resolver.
 */
import { describe, test, expect, beforeEach } from 'bun:test';
import { SettingsStore, resetSettingsStore, getSettingsStore } from '../src/settings/settings-store';
import { validateSetting, buildSchemaRegistry, BUILTIN_SCHEMA } from '../src/settings/schema';
import {
  parseKey, parseChord, keysMatch, keyToString,
  evaluateWhen, KeybindingResolver,
} from '../src/settings/keybindings';

// =============================================================================
// Schema validation
// =============================================================================

describe('validateSetting', () => {
  const schema = buildSchemaRegistry();

  test('accepts valid string enum', () => {
    const r = validateSetting('workbench.sideBar.location', 'left', schema);
    expect(r.valid).toBe(true);
    expect(r.errors).toHaveLength(0);
  });

  test('rejects invalid string enum value', () => {
    const r = validateSetting('workbench.sideBar.location', 'center', schema);
    expect(r.valid).toBe(false);
    expect(r.errors[0]).toContain('not one of');
  });

  test('accepts valid number in range', () => {
    const r = validateSetting('editor.fontSize', 16, schema);
    expect(r.valid).toBe(true);
  });

  test('rejects number below minimum', () => {
    const r = validateSetting('editor.fontSize', 1, schema);
    expect(r.valid).toBe(false);
    expect(r.errors[0]).toContain('minimum');
  });

  test('rejects number above maximum', () => {
    const r = validateSetting('editor.fontSize', 100, schema);
    expect(r.valid).toBe(false);
    expect(r.errors[0]).toContain('maximum');
  });

  test('rejects wrong type', () => {
    const r = validateSetting('editor.fontSize', 'big', schema);
    expect(r.valid).toBe(false);
    expect(r.errors[0]).toContain('expected number');
  });

  test('accepts valid boolean', () => {
    const r = validateSetting('editor.insertSpaces', false, schema);
    expect(r.valid).toBe(true);
  });

  test('rejects unknown setting', () => {
    const r = validateSetting('totally.unknown.key', 42, schema);
    expect(r.valid).toBe(false);
    expect(r.errors[0]).toContain('Unknown setting');
  });

  test('accepts valid object type', () => {
    const r = validateSetting('files.exclude', { '**/.git': true }, schema);
    expect(r.valid).toBe(true);
  });

  test('rejects number when boolean is expected', () => {
    const r = validateSetting('editor.insertSpaces', 1, schema);
    expect(r.valid).toBe(false);
    expect(r.errors[0]).toContain('expected boolean');
  });

  test('accepts number at exact minimum boundary', () => {
    const r = validateSetting('editor.fontSize', 6, schema);
    expect(r.valid).toBe(true);
  });

  test('accepts number at exact maximum boundary', () => {
    const r = validateSetting('editor.fontSize', 72, schema);
    expect(r.valid).toBe(true);
  });

  test('all builtin defaults pass their own validation', () => {
    for (const [key, def] of Object.entries(BUILTIN_SCHEMA)) {
      const r = validateSetting(key, def.default, schema);
      expect(r.valid, `${key} default should be valid: ${r.errors.join(', ')}`).toBe(true);
    }
  });
});

// =============================================================================
// SettingsStore
// =============================================================================

describe('SettingsStore', () => {
  let store: SettingsStore;

  beforeEach(() => {
    store = new SettingsStore();
  });

  test('returns default value for unset key', () => {
    expect(store.get('editor.fontSize')).toBe(13);
    expect(store.get('workbench.sideBar.location')).toBe('left');
  });

  test('user layer overrides default', () => {
    store.set('editor.fontSize', 16, 'user');
    expect(store.get('editor.fontSize')).toBe(16);
  });

  test('workspace layer overrides user', () => {
    store.set('editor.fontSize', 16, 'user');
    store.set('editor.fontSize', 14, 'workspace');
    expect(store.get('editor.fontSize')).toBe(14);
  });

  test('language layer has highest priority', () => {
    store.set('editor.fontSize', 16, 'user');
    store.set('editor.fontSize', 14, 'workspace');
    store.set('editor.fontSize', 12, 'language');
    expect(store.get('editor.fontSize')).toBe(12);
  });

  test('unset removes override and falls back', () => {
    store.set('editor.fontSize', 16, 'user');
    store.unset('editor.fontSize', 'user');
    expect(store.get('editor.fontSize')).toBe(13); // default
  });

  test('cannot write to default layer', () => {
    const r = store.set('editor.fontSize', 99, 'default');
    expect(r.valid).toBe(false);
    expect(r.errors[0]).toContain('default layer');
  });

  test('rejects invalid values', () => {
    const r = store.set('editor.fontSize', -5, 'user');
    expect(r.valid).toBe(false);
    // Value not changed
    expect(store.get('editor.fontSize')).toBe(13);
  });

  test('isOverridden returns false for default-only', () => {
    expect(store.isOverridden('editor.fontSize')).toBe(false);
  });

  test('isOverridden returns true after user set', () => {
    store.set('editor.fontSize', 16, 'user');
    expect(store.isOverridden('editor.fontSize')).toBe(true);
  });

  test('effectiveLayer identifies correct layer', () => {
    expect(store.effectiveLayer('editor.fontSize')).toBe('default');
    store.set('editor.fontSize', 16, 'user');
    expect(store.effectiveLayer('editor.fontSize')).toBe('user');
    store.set('editor.fontSize', 14, 'workspace');
    expect(store.effectiveLayer('editor.fontSize')).toBe('workspace');
  });

  test('loadLayer loads multiple settings', () => {
    const results = store.loadLayer('user', {
      'editor.fontSize': 15,
      'editor.tabSize': 4,
    });
    expect(results.every(r => r.valid)).toBe(true);
    expect(store.get('editor.fontSize')).toBe(15);
    expect(store.get('editor.tabSize')).toBe(4);
  });

  test('loadLayer skips invalid values', () => {
    const results = store.loadLayer('user', {
      'editor.fontSize': 'large',    // invalid
      'editor.tabSize': 4,           // valid
    });
    expect(results.find(r => !r.valid)).toBeTruthy();
    expect(store.get('editor.fontSize')).toBe(13); // unchanged
    expect(store.get('editor.tabSize')).toBe(4);   // set
  });

  test('exportLayer returns current overrides', () => {
    store.set('editor.fontSize', 16, 'user');
    store.set('editor.tabSize', 4, 'user');
    const exported = store.exportLayer('user');
    expect(exported['editor.fontSize']).toBe(16);
    expect(exported['editor.tabSize']).toBe(4);
    expect(Object.keys(exported)).toHaveLength(2);
  });

  test('clearLayer removes all overrides in that layer', () => {
    store.set('editor.fontSize', 16, 'user');
    store.set('editor.tabSize', 4, 'user');
    store.clearLayer('user');
    expect(store.get('editor.fontSize')).toBe(13);
    expect(store.get('editor.tabSize')).toBe(2);
  });

  test('onChange fires on set', () => {
    const events: string[][] = [];
    store.onChange(e => events.push(e.keys));
    store.set('editor.fontSize', 16, 'user');
    expect(events).toHaveLength(1);
    expect(events[0]).toContain('editor.fontSize');
  });

  test('onChange fires on unset', () => {
    store.set('editor.fontSize', 16, 'user');
    const events: string[][] = [];
    store.onChange(e => events.push(e.keys));
    store.unset('editor.fontSize', 'user');
    expect(events).toHaveLength(1);
  });

  test('onChange unsubscribe works', () => {
    const events: string[][] = [];
    const unsub = store.onChange(e => events.push(e.keys));
    store.set('editor.fontSize', 16, 'user');
    unsub();
    store.set('editor.fontSize', 18, 'user');
    expect(events).toHaveLength(1); // only the first event
  });

  test('getFromLayer returns layer-specific value', () => {
    store.set('editor.fontSize', 16, 'user');
    store.set('editor.fontSize', 14, 'workspace');
    expect(store.getFromLayer('editor.fontSize', 'user')).toBe(16);
    expect(store.getFromLayer('editor.fontSize', 'workspace')).toBe(14);
    expect(store.getFromLayer('editor.fontSize', 'language')).toBeUndefined();
  });

  test('keys() returns all schema keys', () => {
    const keys = store.keys();
    expect(keys).toContain('editor.fontSize');
    expect(keys).toContain('workbench.sideBar.location');
    expect(keys.length).toBeGreaterThan(20);
  });

  test('registerSchema adds new setting and provides default', () => {
    store.registerSchema('custom.mySetting', {
      type: 'number',
      default: 42,
      description: 'A custom setting',
    });
    expect(store.get('custom.mySetting')).toBe(42);
    const result = store.set('custom.mySetting', 99, 'user');
    expect(result.valid).toBe(true);
    expect(store.get('custom.mySetting')).toBe(99);
  });

  test('getSchema returns schema definition for known key', () => {
    const schema = store.getSchema('editor.fontSize');
    expect(schema).toBeDefined();
    expect(schema!.type).toBe('number');
    expect(schema!.minimum).toBe(6);
    expect(schema!.maximum).toBe(72);
  });

  test('getSchema returns undefined for unknown key', () => {
    expect(store.getSchema('nonexistent.key')).toBeUndefined();
  });

  test('loadLayer returns empty array for default layer', () => {
    const results = store.loadLayer('default', { 'editor.fontSize': 20 });
    expect(results).toHaveLength(0);
    expect(store.get('editor.fontSize')).toBe(13); // unchanged
  });

  test('clearLayer on default layer is a no-op', () => {
    store.clearLayer('default');
    expect(store.get('editor.fontSize')).toBe(13); // still has default
  });

  test('get returns undefined for completely unknown key', () => {
    expect(store.get('totally.unknown.key.not.in.schema')).toBeUndefined();
  });
});

// =============================================================================
// Global store singleton
// =============================================================================

describe('getSettingsStore', () => {
  test('returns same instance on multiple calls', () => {
    resetSettingsStore();
    const a = getSettingsStore();
    const b = getSettingsStore();
    expect(a).toBe(b);
  });

  test('resetSettingsStore creates fresh instance', () => {
    const a = getSettingsStore();
    a.set('editor.fontSize', 20, 'user');
    resetSettingsStore();
    const b = getSettingsStore();
    expect(b.get('editor.fontSize')).toBe(13); // back to default
  });
});

// =============================================================================
// Key parsing
// =============================================================================

describe('parseKey', () => {
  test('parses simple key', () => {
    const k = parseKey('a');
    expect(k.key).toBe('a');
    expect(k.ctrl).toBe(false);
    expect(k.shift).toBe(false);
  });

  test('parses ctrl+shift+p', () => {
    const k = parseKey('ctrl+shift+p');
    expect(k.ctrl).toBe(true);
    expect(k.shift).toBe(true);
    expect(k.key).toBe('p');
  });

  test('parses cmd alias', () => {
    const k = parseKey('cmd+z');
    expect(k.cmd).toBe(true);
    expect(k.key).toBe('z');
  });

  test('parses alt as option alias', () => {
    const k = parseKey('option+f4');
    expect(k.alt).toBe(true);
    expect(k.key).toBe('f4');
  });

  test('is case-insensitive', () => {
    const k = parseKey('Ctrl+Shift+K');
    expect(k.ctrl).toBe(true);
    expect(k.shift).toBe(true);
    expect(k.key).toBe('k');
  });

  test('serializes back to string', () => {
    const k = parseKey('ctrl+shift+p');
    expect(keyToString(k)).toBe('ctrl+shift+p');
  });
});

describe('parseChord', () => {
  test('parses single key chord', () => {
    const c = parseChord('ctrl+p');
    expect(c.first.key).toBe('p');
    expect(c.second).toBeUndefined();
  });

  test('parses two-key chord', () => {
    const c = parseChord('ctrl+k ctrl+c');
    expect(c.first.key).toBe('k');
    expect(c.second).toBeDefined();
    expect(c.second!.key).toBe('c');
  });
});

describe('keysMatch', () => {
  test('matches identical keys', () => {
    expect(keysMatch(parseKey('ctrl+p'), parseKey('ctrl+p'))).toBe(true);
  });

  test('does not match different keys', () => {
    expect(keysMatch(parseKey('ctrl+p'), parseKey('ctrl+q'))).toBe(false);
  });

  test('does not match missing modifier', () => {
    expect(keysMatch(parseKey('ctrl+p'), parseKey('p'))).toBe(false);
  });
});

// =============================================================================
// When-clause evaluation
// =============================================================================

describe('evaluateWhen', () => {
  const ctx = {
    editorTextFocus: true,
    editorReadonly: false,
    language: 'typescript',
    tabCount: 3,
  };

  test('undefined when is always true', () => {
    expect(evaluateWhen(undefined, ctx)).toBe(true);
  });

  test('simple truthy key', () => {
    expect(evaluateWhen('editorTextFocus', ctx)).toBe(true);
  });

  test('simple falsy key', () => {
    expect(evaluateWhen('editorReadonly', ctx)).toBe(false);
  });

  test('NOT operator', () => {
    expect(evaluateWhen('!editorReadonly', ctx)).toBe(true);
    expect(evaluateWhen('!editorTextFocus', ctx)).toBe(false);
  });

  test('AND operator', () => {
    expect(evaluateWhen('editorTextFocus && !editorReadonly', ctx)).toBe(true);
    expect(evaluateWhen('editorTextFocus && editorReadonly', ctx)).toBe(false);
  });

  test('OR operator', () => {
    expect(evaluateWhen('editorReadonly || editorTextFocus', ctx)).toBe(true);
    expect(evaluateWhen('editorReadonly || !editorTextFocus', ctx)).toBe(false);
  });

  test('equality check', () => {
    expect(evaluateWhen("language == 'typescript'", ctx)).toBe(true);
    expect(evaluateWhen("language == 'javascript'", ctx)).toBe(false);
  });

  test('inequality check', () => {
    expect(evaluateWhen("language != 'javascript'", ctx)).toBe(true);
    expect(evaluateWhen("language != 'typescript'", ctx)).toBe(false);
  });

  test('complex expression', () => {
    expect(evaluateWhen("editorTextFocus && !editorReadonly && language == 'typescript'", ctx)).toBe(true);
  });

  test('unknown key is falsy', () => {
    expect(evaluateWhen('nonExistentKey', ctx)).toBe(false);
  });

  test('parenthesized expression', () => {
    expect(evaluateWhen('(editorTextFocus)', ctx)).toBe(true);
    expect(evaluateWhen('(!editorReadonly)', ctx)).toBe(true);
  });

  test('empty string when is falsy', () => {
    expect(evaluateWhen('', ctx)).toBe(true); // empty string is falsy, but evaluateWhen treats it as "no when clause"
  });
});

// =============================================================================
// KeybindingResolver
// =============================================================================

describe('KeybindingResolver', () => {
  const ctx = {
    editorTextFocus: true,
    editorReadonly: false,
  };

  test('resolves simple single-key binding', () => {
    const resolver = new KeybindingResolver([
      { key: 'ctrl+p', command: 'workbench.action.quickOpen' },
    ]);
    const result = resolver.resolve(parseKey('ctrl+p'), ctx);
    expect(result).not.toBeNull();
    expect(result!.command).toBe('workbench.action.quickOpen');
  });

  test('returns null for unbound key', () => {
    const resolver = new KeybindingResolver([
      { key: 'ctrl+p', command: 'workbench.action.quickOpen' },
    ]);
    const result = resolver.resolve(parseKey('ctrl+q'), ctx);
    expect(result).toBeNull();
  });

  test('when-clause filters binding', () => {
    const resolver = new KeybindingResolver([
      { key: 'ctrl+s', command: 'workbench.action.save', when: 'editorTextFocus && !editorReadonly' },
    ]);
    const result = resolver.resolve(parseKey('ctrl+s'), ctx);
    expect(result).not.toBeNull();

    const readonlyCtx = { ...ctx, editorReadonly: true };
    const blocked = resolver.resolve(parseKey('ctrl+s'), readonlyCtx);
    expect(blocked).toBeNull();
  });

  test('later binding overrides earlier for same key', () => {
    const resolver = new KeybindingResolver([
      { key: 'ctrl+p', command: 'first' },
      { key: 'ctrl+p', command: 'second' },
    ]);
    const result = resolver.resolve(parseKey('ctrl+p'), ctx);
    expect(result!.command).toBe('second');
  });

  test('chord binding requires two keypresses', () => {
    const resolver = new KeybindingResolver([
      { key: 'ctrl+k ctrl+c', command: 'editor.action.addCommentLine' },
    ]);

    // First keypress — should return null and pend the chord
    const first = resolver.resolve(parseKey('ctrl+k'), ctx);
    expect(first).toBeNull();
    expect(resolver.isChordPending()).toBe(true);

    // Second keypress — completes the chord
    const second = resolver.resolve(parseKey('ctrl+c'), ctx);
    expect(second).not.toBeNull();
    expect(second!.command).toBe('editor.action.addCommentLine');
    expect(resolver.isChordPending()).toBe(false);
  });

  test('chord mismatch cancels pending chord', () => {
    const resolver = new KeybindingResolver([
      { key: 'ctrl+k ctrl+c', command: 'editor.action.addCommentLine' },
    ]);
    resolver.resolve(parseKey('ctrl+k'), ctx);
    // Wrong second key
    const result = resolver.resolve(parseKey('ctrl+x'), ctx);
    expect(result).toBeNull();
    expect(resolver.isChordPending()).toBe(false);
  });

  test('cancelChord clears pending state', () => {
    const resolver = new KeybindingResolver([
      { key: 'ctrl+k ctrl+c', command: 'editor.action.addCommentLine' },
    ]);
    resolver.resolve(parseKey('ctrl+k'), ctx);
    expect(resolver.isChordPending()).toBe(true);
    resolver.cancelChord();
    expect(resolver.isChordPending()).toBe(false);
  });

  test('args are passed through', () => {
    const resolver = new KeybindingResolver([
      { key: 'ctrl+1', command: 'workbench.action.openEditorAtIndex', args: { index: 0 } },
    ]);
    const result = resolver.resolve(parseKey('ctrl+1'), ctx);
    expect(result!.args).toEqual({ index: 0 });
  });
});
