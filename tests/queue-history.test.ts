import { describe, test, expect } from 'bun:test';
import { QueueHistory } from '../src/queue/queue-history';

describe('QueueHistory', () => {
  test('record and retrieve entry', () => {
    const history = new QueueHistory();
    history.record('p1', 'accepted');
    const entry = history.getEntry('p1');
    expect(entry).not.toBeNull();
    expect(entry!.proposalId).toBe('p1');
    expect(entry!.action).toBe('accepted');
  });

  test('record rejected entry', () => {
    const history = new QueueHistory();
    history.record('p1', 'rejected');
    const entry = history.getEntry('p1');
    expect(entry!.action).toBe('rejected');
  });

  test('record with reverse diffs', () => {
    const history = new QueueHistory();
    const reverses = new Map<string, string>();
    reverses.set('file.ts', 'reverse diff content');
    history.record('p1', 'accepted', reverses);
    const entry = history.getEntry('p1');
    expect(entry!.reverseDiffs.get('file.ts')).toBe('reverse diff content');
  });

  test('getUndoable returns accepted entries most recent first', () => {
    const history = new QueueHistory();
    history.record('p1', 'accepted');
    history.record('p2', 'rejected');
    history.record('p3', 'accepted');

    const undoable = history.getUndoable(10);
    expect(undoable.length).toBe(2);
    expect(undoable[0].proposalId).toBe('p3');
    expect(undoable[1].proposalId).toBe('p1');
  });

  test('getUndoable respects count limit', () => {
    const history = new QueueHistory();
    history.record('p1', 'accepted');
    history.record('p2', 'accepted');
    history.record('p3', 'accepted');

    const undoable = history.getUndoable(2);
    expect(undoable.length).toBe(2);
  });

  test('markUndone changes action to undone', () => {
    const history = new QueueHistory();
    history.record('p1', 'accepted');
    history.markUndone('p1');
    const entry = history.getEntry('p1');
    expect(entry!.action).toBe('undone');
  });

  test('markUndone removes from undoable list', () => {
    const history = new QueueHistory();
    history.record('p1', 'accepted');
    history.markUndone('p1');
    const undoable = history.getUndoable(10);
    expect(undoable.length).toBe(0);
  });

  test('history caps at max entries', () => {
    const history = new QueueHistory(3);
    history.record('p1', 'accepted');
    history.record('p2', 'accepted');
    history.record('p3', 'accepted');
    history.record('p4', 'accepted');

    expect(history.count).toBe(3);
    expect(history.getEntry('p1')).toBeNull();
    expect(history.getEntry('p4')).not.toBeNull();
  });

  test('setMaxEntries trims history', () => {
    const history = new QueueHistory(100);
    history.record('p1', 'accepted');
    history.record('p2', 'accepted');
    history.record('p3', 'accepted');

    history.setMaxEntries(2);
    expect(history.count).toBe(2);
    expect(history.getEntry('p1')).toBeNull();
  });

  test('clear empties history', () => {
    const history = new QueueHistory();
    history.record('p1', 'accepted');
    history.record('p2', 'accepted');
    history.clear();
    expect(history.count).toBe(0);
  });

  test('getAllEntries returns copy', () => {
    const history = new QueueHistory();
    history.record('p1', 'accepted');
    const all = history.getAllEntries();
    expect(all.length).toBe(1);
    all.length = 0;
    expect(history.count).toBe(1); // original unchanged
  });
});
