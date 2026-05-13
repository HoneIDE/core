/**
 * Tests for Slice 14: Extension System.
 */
import { describe, test, expect, beforeEach } from 'bun:test';
import {
  parseManifest,
  ExtensionRegistry,
  ExtensionHost,
  createCommandRegistry,
  createStatusBarItem,
  createDiagnosticCollection,
  createOutputChannel,
  type ExtensionManifest,
} from '../src/extensions/index';

// =============================================================================
// Manifest Parsing
// =============================================================================

describe('parseManifest', () => {
  const validManifest = JSON.stringify({
    id: 'publisher.my-ext',
    name: 'My Extension',
    version: '1.0.0',
    description: 'A test extension',
    publisher: 'publisher',
    main: './dist/extension.js',
    activationEvents: ['onLanguage:typescript'],
    contributes: {
      commands: [
        { command: 'myext.hello', title: 'Say Hello' },
      ],
    },
    engines: { hone: '^1.0.0' },
    categories: ['Programming Languages'],
  });

  test('parses valid manifest', () => {
    const { manifest, errors } = parseManifest(validManifest);
    expect(errors).toHaveLength(0);
    expect(manifest).not.toBeNull();
    expect(manifest!.id).toBe('publisher.my-ext');
    expect(manifest!.name).toBe('My Extension');
    expect(manifest!.version).toBe('1.0.0');
    expect(manifest!.main).toBe('./dist/extension.js');
    expect(manifest!.activationEvents).toHaveLength(1);
    expect(manifest!.contributes.commands).toHaveLength(1);
    expect(manifest!.categories).toHaveLength(1);
  });

  test('rejects invalid JSON', () => {
    const { manifest, errors } = parseManifest('not json');
    expect(manifest).toBeNull();
    expect(errors[0].message).toBe('Invalid JSON');
  });

  test('rejects missing id', () => {
    const { manifest, errors } = parseManifest(JSON.stringify({
      name: 'Test', version: '1.0.0', main: './index.js',
    }));
    expect(manifest).toBeNull();
    expect(errors.some(e => e.field === 'id')).toBe(true);
  });

  test('rejects missing name', () => {
    const { errors } = parseManifest(JSON.stringify({
      id: 'test', version: '1.0.0', main: './index.js',
    }));
    expect(errors.some(e => e.field === 'name')).toBe(true);
  });

  test('rejects missing version', () => {
    const { errors } = parseManifest(JSON.stringify({
      id: 'test', name: 'Test', main: './index.js',
    }));
    expect(errors.some(e => e.field === 'version')).toBe(true);
  });

  test('rejects missing main', () => {
    const { errors } = parseManifest(JSON.stringify({
      id: 'test', name: 'Test', version: '1.0.0',
    }));
    expect(errors.some(e => e.field === 'main')).toBe(true);
  });

  test('handles minimal manifest', () => {
    const { manifest } = parseManifest(JSON.stringify({
      id: 'test', name: 'Test', version: '1.0.0', main: './index.js',
    }));
    expect(manifest).not.toBeNull();
    expect(manifest!.activationEvents).toHaveLength(0);
    expect(manifest!.categories).toHaveLength(0);
  });

  test('parses contributions', () => {
    const { manifest } = parseManifest(JSON.stringify({
      id: 'test', name: 'Test', version: '1.0.0', main: './index.js',
      contributes: {
        commands: [{ command: 'test.cmd', title: 'Test Command' }],
        languages: [{ id: 'myLang', extensions: ['.ml'] }],
        keybindings: [{ command: 'test.cmd', key: 'ctrl+shift+t' }],
      },
    }));
    expect(manifest!.contributes.commands).toHaveLength(1);
    expect(manifest!.contributes.languages).toHaveLength(1);
    expect(manifest!.contributes.keybindings).toHaveLength(1);
  });
});

// =============================================================================
// ExtensionRegistry
// =============================================================================

describe('ExtensionRegistry', () => {
  let registry: ExtensionRegistry;
  const manifest1: ExtensionManifest = {
    id: 'pub.ext1', name: 'Ext 1', version: '1.0.0',
    description: 'First extension', publisher: 'pub',
    main: './index.js', activationEvents: ['onLanguage:typescript'],
    contributes: { commands: [{ command: 'ext1.hello', title: 'Hello' }] },
    engines: { hone: '*' }, categories: ['Programming Languages'],
  };
  const manifest2: ExtensionManifest = {
    id: 'pub.ext2', name: 'Ext 2', version: '2.0.0',
    description: 'Second extension with themes', publisher: 'pub',
    main: './index.js', activationEvents: ['*'],
    contributes: {}, engines: { hone: '*' }, categories: ['Themes'],
  };

  beforeEach(() => {
    registry = new ExtensionRegistry();
  });

  test('starts empty', () => {
    expect(registry.count).toBe(0);
  });

  test('register adds extension', () => {
    registry.register(manifest1, '/ext/ext1');
    expect(registry.count).toBe(1);
    expect(registry.has('pub.ext1')).toBe(true);
  });

  test('register updates existing', () => {
    registry.register(manifest1, '/ext/ext1');
    const updated = { ...manifest1, version: '2.0.0' };
    registry.register(updated, '/ext/ext1-v2');
    expect(registry.count).toBe(1);
    expect(registry.get('pub.ext1')!.manifest.version).toBe('2.0.0');
  });

  test('unregister removes extension', () => {
    registry.register(manifest1, '/ext/ext1');
    registry.unregister('pub.ext1');
    expect(registry.has('pub.ext1')).toBe(false);
    expect(registry.count).toBe(0);
  });

  test('get returns null for missing', () => {
    expect(registry.get('nonexistent')).toBeNull();
  });

  test('getAll returns all', () => {
    registry.register(manifest1, '/ext/ext1');
    registry.register(manifest2, '/ext/ext2');
    expect(registry.getAll()).toHaveLength(2);
  });

  test('getByState filters correctly', () => {
    registry.register(manifest1, '/ext/ext1');
    registry.register(manifest2, '/ext/ext2');
    registry.activate('pub.ext1');
    expect(registry.getByState('active')).toHaveLength(1);
    expect(registry.getByState('installed')).toHaveLength(1);
  });

  test('getByCategory', () => {
    registry.register(manifest1, '/ext/ext1');
    registry.register(manifest2, '/ext/ext2');
    expect(registry.getByCategory('Themes')).toHaveLength(1);
    expect(registry.getByCategory('Programming Languages')).toHaveLength(1);
    expect(registry.getByCategory('Unknown')).toHaveLength(0);
  });

  test('activate and deactivate', () => {
    registry.register(manifest1, '/ext/ext1');
    registry.activate('pub.ext1');
    expect(registry.get('pub.ext1')!.state).toBe('active');
    expect(registry.get('pub.ext1')!.activatedAt).toBeGreaterThan(0);
    registry.deactivate('pub.ext1');
    expect(registry.get('pub.ext1')!.state).toBe('inactive');
  });

  test('setError', () => {
    registry.register(manifest1, '/ext/ext1');
    registry.setError('pub.ext1', 'crash');
    expect(registry.get('pub.ext1')!.state).toBe('error');
    expect(registry.get('pub.ext1')!.error).toBe('crash');
  });

  test('findByActivationEvent', () => {
    registry.register(manifest1, '/ext/ext1');
    registry.register(manifest2, '/ext/ext2');
    // ext1 activates on onLanguage:typescript, ext2 on *
    const matches = registry.findByActivationEvent('onLanguage:typescript');
    expect(matches).toHaveLength(2); // both match (ext2 has *)
  });

  test('findByActivationEvent skips active', () => {
    registry.register(manifest1, '/ext/ext1');
    registry.activate('pub.ext1');
    const matches = registry.findByActivationEvent('onLanguage:typescript');
    expect(matches).toHaveLength(0);
  });

  test('search by name', () => {
    registry.register(manifest1, '/ext/ext1');
    registry.register(manifest2, '/ext/ext2');
    expect(registry.search('Ext 1')).toHaveLength(1);
    expect(registry.search('ext')).toHaveLength(2);
    expect(registry.search('themes')).toHaveLength(1);
  });

  test('getAllCommands from active extensions', () => {
    registry.register(manifest1, '/ext/ext1');
    registry.activate('pub.ext1');
    const cmds = registry.getAllCommands();
    expect(cmds).toHaveLength(1);
    expect(cmds[0].command).toBe('ext1.hello');
  });
});

// =============================================================================
// ExtensionHost
// =============================================================================

describe('ExtensionHost', () => {
  let host: ExtensionHost;
  const manifest: ExtensionManifest = {
    id: 'pub.test', name: 'Test', version: '1.0.0',
    description: 'Test ext', publisher: 'pub',
    main: './index.js', activationEvents: ['onCommand:test.hello'],
    contributes: { commands: [{ command: 'test.hello', title: 'Hello' }] },
    engines: { hone: '*' }, categories: [],
  };

  beforeEach(() => {
    host = new ExtensionHost();
  });

  test('install registers extension', () => {
    host.install(manifest, '/ext/test');
    expect(host.registry.has('pub.test')).toBe(true);
  });

  test('activate changes state', () => {
    host.install(manifest, '/ext/test');
    host.activate('pub.test');
    expect(host.registry.get('pub.test')!.state).toBe('active');
  });

  test('deactivate changes state', () => {
    host.install(manifest, '/ext/test');
    host.activate('pub.test');
    host.deactivate('pub.test');
    expect(host.registry.get('pub.test')!.state).toBe('inactive');
  });

  test('uninstall removes extension', () => {
    host.install(manifest, '/ext/test');
    host.uninstall('pub.test');
    expect(host.registry.has('pub.test')).toBe(false);
  });

  test('registerCommand and executeCommand', () => {
    host.registerCommand('test.hello', (name: unknown) => `Hello ${name}!`);
    expect(host.hasCommand('test.hello')).toBe(true);
    expect(host.executeCommand('test.hello', 'World')).toBe('Hello World!');
  });

  test('executeCommand returns undefined for unregistered', () => {
    expect(host.executeCommand('nope')).toBeUndefined();
  });

  test('getCommandIds lists registered commands', () => {
    host.registerCommand('a', () => {});
    host.registerCommand('b', () => {});
    expect(host.getCommandIds()).toHaveLength(2);
  });

  test('fireActivationEvent activates matching extensions', () => {
    host.install(manifest, '/ext/test');
    const activated = host.fireActivationEvent('onCommand:test.hello');
    expect(activated).toHaveLength(1);
    expect(activated[0]).toBe('pub.test');
    expect(host.registry.get('pub.test')!.state).toBe('active');
  });

  test('fireActivationEvent skips already active', () => {
    host.install(manifest, '/ext/test');
    host.activate('pub.test');
    const activated = host.fireActivationEvent('onCommand:test.hello');
    expect(activated).toHaveLength(0);
  });

  test('buildAPI provides working commands', () => {
    const api = host.buildAPI();
    api.commands.registerCommand('api.test', () => 42);
    expect(api.commands.executeCommand('api.test')).toBe(42);
  });

  test('setWorkspaceRoot reflected in API', () => {
    host.setWorkspaceRoot('/home/user/project');
    const api = host.buildAPI();
    expect(api.workspace.rootPath).toBe('/home/user/project');
  });

  test('getStats counts correctly', () => {
    host.install(manifest, '/ext/test');
    const stats1 = host.getStats();
    expect(stats1.installed).toBe(1);
    expect(stats1.inactive).toBe(1);
    expect(stats1.active).toBe(0);

    host.activate('pub.test');
    const stats2 = host.getStats();
    expect(stats2.active).toBe(1);
    expect(stats2.inactive).toBe(0);
  });
});

// =============================================================================
// Extension API Implementation
// =============================================================================

describe('createCommandRegistry', () => {
  test('register and execute', () => {
    const registry = createCommandRegistry();
    registry.register('test.cmd', (x: number) => x * 2);
    expect(registry.execute('test.cmd', 5)).toBe(10);
  });

  test('has returns true for registered commands', () => {
    const registry = createCommandRegistry();
    registry.register('a.cmd', () => {});
    expect(registry.has('a.cmd')).toBe(true);
    expect(registry.has('b.cmd')).toBe(false);
  });

  test('execute unknown command throws', () => {
    const registry = createCommandRegistry();
    expect(() => registry.execute('unknown')).toThrow('Command not found: unknown');
  });

  test('getAll returns all command IDs', () => {
    const registry = createCommandRegistry();
    registry.register('a', () => {});
    registry.register('b', () => {});
    registry.register('c', () => {});
    const all = registry.getAll();
    expect(all).toHaveLength(3);
    expect(all).toContain('a');
    expect(all).toContain('b');
    expect(all).toContain('c');
  });
});

describe('createStatusBarItem', () => {
  test('defaults', () => {
    const item = createStatusBarItem('git-branch');
    expect(item.id).toBe('git-branch');
    expect(item.text).toBe('');
    expect(item.tooltip).toBe('');
    expect(item.alignment).toBe('left');
    expect(item.priority).toBe(0);
    expect(item.visible).toBe(true);
  });
});

describe('createDiagnosticCollection', () => {
  test('set and get diagnostics', () => {
    const dc = createDiagnosticCollection('typescript');
    dc.set('file:///a.ts', [{ line: 1, message: 'error', severity: 'error' }]);
    const diags = dc.get('file:///a.ts');
    expect(diags).toHaveLength(1);
    expect(diags[0].severity).toBe('error');
  });

  test('delete removes diagnostics for a URI', () => {
    const dc = createDiagnosticCollection('lint');
    dc.set('file:///a.ts', [{ line: 1, message: 'warn', severity: 'warning' }]);
    dc.delete('file:///a.ts');
    expect(dc.get('file:///a.ts')).toHaveLength(0);
  });

  test('clear removes all diagnostics', () => {
    const dc = createDiagnosticCollection('lint');
    dc.set('file:///a.ts', [{ line: 1, message: 'err', severity: 'error' }]);
    dc.set('file:///b.ts', [{ line: 2, message: 'warn', severity: 'warning' }]);
    dc.clear();
    expect(dc.entries.size).toBe(0);
  });
});

describe('createOutputChannel', () => {
  test('append and appendLine', () => {
    const ch = createOutputChannel('Build');
    ch.appendLine('Starting build...');
    ch.appendLine('Step 1');
    ch.append(' done');
    ch.appendLine('Step 2 done');
    expect(ch.lines).toHaveLength(3);
    expect(ch.lines[0]).toBe('Starting build...');
    expect(ch.lines[1]).toBe('Step 1 done');
    expect(ch.lines[2]).toBe('Step 2 done');
  });

  test('clear removes all lines', () => {
    const ch = createOutputChannel('Test');
    ch.appendLine('line 1');
    ch.appendLine('line 2');
    ch.clear();
    expect(ch.lines).toHaveLength(0);
  });
});
