/**
 * Workspace tests — folder management, path utilities, filesystem reading.
 */

import { describe, test, expect, beforeEach, afterEach } from 'bun:test';
import { Workspace } from '../src/workspace/workspace';
import { mkdir, writeFile, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

describe('Workspace', () => {
  let ws: Workspace;

  beforeEach(() => {
    ws = new Workspace();
  });

  // -----------------------------------------------------------------------
  // Folder management
  // -----------------------------------------------------------------------

  test('starts with no folders', () => {
    expect(ws.folderCount).toBe(0);
    expect(ws.isOpen).toBe(false);
  });

  test('addFolder adds a workspace root', () => {
    ws.addFolder('/projects/myapp');
    expect(ws.folderCount).toBe(1);
    expect(ws.isOpen).toBe(true);
    expect(ws.folders[0].name).toBe('myapp');
    expect(ws.folders[0].path).toBe('/projects/myapp');
  });

  test('addFolder with custom name', () => {
    ws.addFolder('/projects/myapp', 'My App');
    expect(ws.folders[0].name).toBe('My App');
  });

  test('addFolder deduplicates by path', () => {
    ws.addFolder('/projects/myapp');
    ws.addFolder('/projects/myapp');
    expect(ws.folderCount).toBe(1);
  });

  test('multiple folders have correct indices', () => {
    ws.addFolder('/projects/frontend');
    ws.addFolder('/projects/backend');
    ws.addFolder('/projects/shared');
    expect(ws.folders[0].index).toBe(0);
    expect(ws.folders[1].index).toBe(1);
    expect(ws.folders[2].index).toBe(2);
  });

  test('removeFolder removes by path', () => {
    ws.addFolder('/projects/myapp');
    const removed = ws.removeFolder('/projects/myapp');
    expect(removed).toBe(true);
    expect(ws.folderCount).toBe(0);
    expect(ws.isOpen).toBe(false);
  });

  test('removeFolder re-indexes remaining folders', () => {
    ws.addFolder('/a');
    ws.addFolder('/b');
    ws.addFolder('/c');
    ws.removeFolder('/b');
    expect(ws.folders[0].path).toBe('/a');
    expect(ws.folders[0].index).toBe(0);
    expect(ws.folders[1].path).toBe('/c');
    expect(ws.folders[1].index).toBe(1);
  });

  test('removeFolder returns false for unknown path', () => {
    expect(ws.removeFolder('/nope')).toBe(false);
  });

  test('close removes all folders', () => {
    ws.addFolder('/a');
    ws.addFolder('/b');
    ws.close();
    expect(ws.folderCount).toBe(0);
    expect(ws.isOpen).toBe(false);
  });

  // -----------------------------------------------------------------------
  // Path queries
  // -----------------------------------------------------------------------

  test('contains checks if path is inside workspace', () => {
    ws.addFolder('/projects/myapp');
    expect(ws.contains('/projects/myapp/src/index.ts')).toBe(true);
    expect(ws.contains('/projects/myapp')).toBe(true);
    expect(ws.contains('/projects/other/file.ts')).toBe(false);
    expect(ws.contains('/projects/myapp-extra/file.ts')).toBe(false);
  });

  test('getFolderForPath returns correct folder', () => {
    ws.addFolder('/projects/frontend');
    ws.addFolder('/projects/backend');

    expect(ws.getFolderForPath('/projects/frontend/src/app.ts')?.name).toBe('frontend');
    expect(ws.getFolderForPath('/projects/backend/api/index.ts')?.name).toBe('backend');
    expect(ws.getFolderForPath('/elsewhere/file.ts')).toBeUndefined();
  });

  test('getRelativePath computes path from folder root', () => {
    ws.addFolder('/projects/myapp');
    expect(ws.getRelativePath('/projects/myapp/src/index.ts')).toBe('src/index.ts');
    expect(ws.getRelativePath('/elsewhere/file.ts')).toBeNull();
  });

  test('getFolderByPath retrieves by path', () => {
    ws.addFolder('/projects/myapp');
    expect(ws.getFolderByPath('/projects/myapp')).toBeDefined();
    expect(ws.getFolderByPath('/nope')).toBeUndefined();
  });

  // -----------------------------------------------------------------------
  // Ignore patterns
  // -----------------------------------------------------------------------

  test('shouldIgnore returns true for default patterns', () => {
    expect(ws.shouldIgnore('node_modules')).toBe(true);
    expect(ws.shouldIgnore('.git')).toBe(true);
    expect(ws.shouldIgnore('.DS_Store')).toBe(true);
    expect(ws.shouldIgnore('__pycache__')).toBe(true);
  });

  test('shouldIgnore returns true for dotfiles', () => {
    expect(ws.shouldIgnore('.env')).toBe(true);
    expect(ws.shouldIgnore('.eslintrc')).toBe(true);
  });

  test('shouldIgnore returns false for normal files', () => {
    expect(ws.shouldIgnore('index.ts')).toBe(false);
    expect(ws.shouldIgnore('package.json')).toBe(false);
    expect(ws.shouldIgnore('src')).toBe(false);
  });

  // -----------------------------------------------------------------------
  // Events
  // -----------------------------------------------------------------------

  test('emits folder-added event', () => {
    const events: string[] = [];
    ws.onEvent(e => events.push(e.type));

    ws.addFolder('/a');
    expect(events).toContain('folder-added');
    expect(events).toContain('workspace-opened');
  });

  test('emits folder-removed and workspace-closed', () => {
    ws.addFolder('/a');

    const events: string[] = [];
    ws.onEvent(e => events.push(e.type));

    ws.removeFolder('/a');
    expect(events).toContain('folder-removed');
    expect(events).toContain('workspace-closed');
  });

  test('unsubscribe stops events', () => {
    let count = 0;
    const unsub = ws.onEvent(() => count++);

    ws.addFolder('/a');
    expect(count).toBe(2); // folder-added + workspace-opened

    unsub();
    ws.addFolder('/b');
    expect(count).toBe(2); // No more events
  });

  // -----------------------------------------------------------------------
  // Filesystem reading (uses real tmpdir)
  // -----------------------------------------------------------------------

  describe('readDirectory', () => {
    const testDir = join(tmpdir(), 'hone-test-workspace-' + Date.now());

    beforeEach(async () => {
      await mkdir(join(testDir, 'src'), { recursive: true });
      await mkdir(join(testDir, 'tests'), { recursive: true });
      await writeFile(join(testDir, 'package.json'), '{}');
      await writeFile(join(testDir, 'src', 'index.ts'), '');
      await writeFile(join(testDir, 'src', 'app.ts'), '');
      await writeFile(join(testDir, 'tests', 'app.test.ts'), '');
      ws.addFolder(testDir);
    });

    afterEach(async () => {
      await rm(testDir, { recursive: true, force: true });
    });

    test('lists directories before files, alphabetically', async () => {
      const entries = await ws.readDirectory(testDir);
      const names = entries.map(e => e.name);

      // Directories first
      const firstDirIdx = names.indexOf('src');
      const firstFileIdx = names.indexOf('package.json');
      expect(firstDirIdx).toBeLessThan(firstFileIdx);

      // Should contain our test entries
      expect(names).toContain('src');
      expect(names).toContain('tests');
      expect(names).toContain('package.json');
    });

    test('entries have correct types', async () => {
      const entries = await ws.readDirectory(testDir);
      const src = entries.find(e => e.name === 'src');
      const pkg = entries.find(e => e.name === 'package.json');

      expect(src?.type).toBe('directory');
      expect(pkg?.type).toBe('file');
    });

    test('entries have correct relative paths', async () => {
      const entries = await ws.readDirectory(testDir);
      const src = entries.find(e => e.name === 'src');
      expect(src?.relativePath).toBe('src');
    });

    test('readDirectory respects ignore patterns', async () => {
      await mkdir(join(testDir, 'node_modules'), { recursive: true });
      await mkdir(join(testDir, '.git'), { recursive: true });

      const entries = await ws.readDirectory(testDir);
      const names = entries.map(e => e.name);

      expect(names).not.toContain('node_modules');
      expect(names).not.toContain('.git');
    });

    test('collectAllFiles returns all files recursively', async () => {
      const files = await ws.collectAllFiles(testDir);
      expect(files).toContain('package.json');
      expect(files).toContain(join('src', 'index.ts'));
      expect(files).toContain(join('src', 'app.ts'));
      expect(files).toContain(join('tests', 'app.test.ts'));
    });

    test('collectAllFiles respects ignore patterns', async () => {
      await mkdir(join(testDir, 'node_modules', 'dep'), { recursive: true });
      await writeFile(join(testDir, 'node_modules', 'dep', 'index.js'), '');

      const files = await ws.collectAllFiles(testDir);
      const hasNodeModules = files.some(f => f.includes('node_modules'));
      expect(hasNodeModules).toBe(false);
    });
  });
});
