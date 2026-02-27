/**
 * FileWatcher tests — event debouncing, coalescing, and lifecycle.
 */

import { describe, test, expect, beforeEach } from 'bun:test';
import { FileWatcher, type FileChangeEvent } from '../src/workspace/file-watcher';

describe('FileWatcher', () => {
  let watcher: FileWatcher;

  beforeEach(() => {
    watcher = new FileWatcher({ debounceMs: 10 });
  });

  test('starts with no watchers', () => {
    expect(watcher.watcherCount).toBe(0);
  });

  test('injectEvent + flush delivers events to listeners', () => {
    const received: FileChangeEvent[][] = [];
    watcher.onChange((events) => received.push(events));

    watcher.injectEvent({ path: '/test/a.ts', relativePath: 'a.ts', type: 'changed' });
    watcher.flush();

    expect(received.length).toBe(1);
    expect(received[0].length).toBe(1);
    expect(received[0][0].path).toBe('/test/a.ts');
  });

  test('multiple events are coalesced per path', () => {
    const received: FileChangeEvent[][] = [];
    watcher.onChange((events) => received.push(events));

    // Same file changed multiple times
    watcher.injectEvent({ path: '/test/a.ts', relativePath: 'a.ts', type: 'changed' });
    watcher.injectEvent({ path: '/test/a.ts', relativePath: 'a.ts', type: 'changed' });
    watcher.injectEvent({ path: '/test/a.ts', relativePath: 'a.ts', type: 'changed' });
    watcher.flush();

    expect(received.length).toBe(1);
    expect(received[0].length).toBe(1); // Coalesced to 1 event
  });

  test('different files are reported as separate events', () => {
    const received: FileChangeEvent[][] = [];
    watcher.onChange((events) => received.push(events));

    watcher.injectEvent({ path: '/test/a.ts', relativePath: 'a.ts', type: 'changed' });
    watcher.injectEvent({ path: '/test/b.ts', relativePath: 'b.ts', type: 'created' });
    watcher.flush();

    expect(received.length).toBe(1);
    expect(received[0].length).toBe(2);
  });

  test('last event wins for coalesced paths', () => {
    const received: FileChangeEvent[][] = [];
    watcher.onChange((events) => received.push(events));

    watcher.injectEvent({ path: '/test/a.ts', relativePath: 'a.ts', type: 'changed' });
    watcher.injectEvent({ path: '/test/a.ts', relativePath: 'a.ts', type: 'created' });
    watcher.flush();

    expect(received[0][0].type).toBe('created'); // Last event wins
  });

  test('debounce batches events within the window', async () => {
    const received: FileChangeEvent[][] = [];
    watcher.onChange((events) => received.push(events));

    watcher.injectEvent({ path: '/test/a.ts', relativePath: 'a.ts', type: 'changed' });
    watcher.injectEvent({ path: '/test/b.ts', relativePath: 'b.ts', type: 'changed' });

    // Wait for debounce to fire
    await new Promise(r => setTimeout(r, 50));

    expect(received.length).toBe(1);
    expect(received[0].length).toBe(2);
  });

  test('flush with no pending events is a no-op', () => {
    const received: FileChangeEvent[][] = [];
    watcher.onChange((events) => received.push(events));

    watcher.flush();
    expect(received.length).toBe(0);
  });

  test('dispose clears pending events', () => {
    const received: FileChangeEvent[][] = [];
    watcher.onChange((events) => received.push(events));

    watcher.injectEvent({ path: '/test/a.ts', relativePath: 'a.ts', type: 'changed' });
    watcher.dispose();
    watcher.flush(); // Should not fire since pending was cleared

    expect(received.length).toBe(0);
  });

  test('multiple listeners all receive events', () => {
    let count1 = 0;
    let count2 = 0;
    watcher.onChange(() => count1++);
    watcher.onChange(() => count2++);

    watcher.injectEvent({ path: '/test/a.ts', relativePath: 'a.ts', type: 'changed' });
    watcher.flush();

    expect(count1).toBe(1);
    expect(count2).toBe(1);
  });

  test('unsubscribed listener does not receive events', () => {
    let count = 0;
    const unsub = watcher.onChange(() => count++);

    watcher.injectEvent({ path: '/test/a.ts', relativePath: 'a.ts', type: 'changed' });
    unsub();
    watcher.flush();

    expect(count).toBe(0);
  });
});
