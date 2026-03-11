/**
 * TelemetryCollector tests — event tracking, batching, serialization.
 */

import { describe, test, expect, beforeEach } from 'bun:test';
import { TelemetryCollector, serializeBatch } from '../src/telemetry/telemetry-collector';

describe('TelemetryCollector', () => {
  let collector: TelemetryCollector;

  beforeEach(() => {
    collector = new TelemetryCollector(50);
  });

  test('starts disabled with empty queue', () => {
    expect(collector.enabled).toBe(false);
    expect(collector.queueLength).toBe(0);
  });

  test('track returns false when disabled', () => {
    expect(collector.track('test', { platform: 'macos' })).toBe(false);
    expect(collector.queueLength).toBe(0);
  });

  test('track queues events when enabled', () => {
    collector.enabled = true;
    expect(collector.track('session_start', { platform: 'macos', version: '0.1.0' })).toBe(true);
    expect(collector.queueLength).toBe(1);
  });

  test('track respects max batch size', () => {
    const small = new TelemetryCollector(3);
    small.enabled = true;
    expect(small.track('a', {})).toBe(true);
    expect(small.track('b', {})).toBe(true);
    expect(small.track('c', {})).toBe(true);
    expect(small.track('d', {})).toBe(false);
    expect(small.queueLength).toBe(3);
  });

  test('flush returns events and clears queue', () => {
    collector.enabled = true;
    collector.track('file_open', { platform: 'macos', version: '0.1.0' });
    collector.track('search', { platform: 'macos', version: '0.1.0' });

    const batch = collector.flush();
    expect(batch.events.length).toBe(2);
    expect(batch.events[0].event).toBe('file_open');
    expect(batch.events[1].event).toBe('search');
    expect(collector.queueLength).toBe(0);
  });

  test('flush on empty queue returns empty batch', () => {
    collector.enabled = true;
    const batch = collector.flush();
    expect(batch.events.length).toBe(0);
  });

  test('reset clears queue without returning', () => {
    collector.enabled = true;
    collector.track('error', { platform: 'macos', type: 'ffi' });
    collector.reset();
    expect(collector.queueLength).toBe(0);
  });

  test('events preserve dimensions', () => {
    collector.enabled = true;
    collector.track('ai_chat', { platform: 'macos', provider: 'anthropic', model: 'claude-sonnet-4-6' });

    const batch = collector.flush();
    expect(batch.events[0].dims.platform).toBe('macos');
    expect(batch.events[0].dims.provider).toBe('anthropic');
    expect(batch.events[0].dims.model).toBe('claude-sonnet-4-6');
  });
});

describe('serializeBatch', () => {
  test('empty batch returns empty string', () => {
    expect(serializeBatch({ events: [] })).toBe('');
  });

  test('single event serializes correctly', () => {
    const json = serializeBatch({
      events: [{ event: 'session_start', dims: { platform: 'macos', version: '0.1.0' } }],
    });
    const parsed = JSON.parse(json);
    expect(parsed.events.length).toBe(1);
    expect(parsed.events[0].event).toBe('session_start');
    expect(parsed.events[0].dims.platform).toBe('macos');
    expect(parsed.events[0].dims.version).toBe('0.1.0');
  });

  test('multiple events serialize correctly', () => {
    const json = serializeBatch({
      events: [
        { event: 'file_open', dims: { platform: 'ios' } },
        { event: 'search', dims: { platform: 'ios', version: '0.1.0' } },
      ],
    });
    const parsed = JSON.parse(json);
    expect(parsed.events.length).toBe(2);
    expect(parsed.events[0].event).toBe('file_open');
    expect(parsed.events[1].event).toBe('search');
  });

  test('event with no dimensions serializes correctly', () => {
    const json = serializeBatch({
      events: [{ event: 'ping', dims: {} }],
    });
    const parsed = JSON.parse(json);
    expect(parsed.events[0].dims).toEqual({});
  });
});
