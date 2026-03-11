/**
 * TelemetryCollector — testable event collector for anonymous usage telemetry.
 *
 * Collects Chirp events with up to 4 dimensions each.
 * Events are batched and flushed periodically (max 50 per batch).
 * No PII is ever collected — see NEVER-collected list in plan.
 */

export interface TelemetryEvent {
  event: string;
  dims: Record<string, string>;
}

export interface TelemetryBatch {
  events: TelemetryEvent[];
}

export class TelemetryCollector {
  private _events: TelemetryEvent[] = [];
  private _maxBatchSize: number;
  private _enabled: boolean = false;

  constructor(maxBatchSize: number = 50) {
    this._maxBatchSize = maxBatchSize;
  }

  get enabled(): boolean {
    return this._enabled;
  }

  set enabled(value: boolean) {
    this._enabled = value;
  }

  get queueLength(): number {
    return this._events.length;
  }

  /** Track an event. Returns false if telemetry is disabled or queue is full. */
  track(event: string, dims: Record<string, string>): boolean {
    if (!this._enabled) return false;
    if (this._events.length >= this._maxBatchSize) return false;
    this._events.push({ event, dims });
    return true;
  }

  /** Flush all queued events and return them as a batch. Clears the queue. */
  flush(): TelemetryBatch {
    const batch: TelemetryBatch = { events: this._events.slice() };
    this._events = [];
    return batch;
  }

  /** Reset the collector — clears queue without returning events. */
  reset(): void {
    this._events = [];
  }
}

/** Serialize a TelemetryBatch to JSON string. */
export function serializeBatch(batch: TelemetryBatch): string {
  if (batch.events.length === 0) return '';

  let out = '{"events":[';
  for (let i = 0; i < batch.events.length; i++) {
    if (i > 0) out += ',';
    const ev = batch.events[i];
    out += '{"event":"';
    out += ev.event;
    out += '","dims":{';
    const keys = Object.keys(ev.dims);
    for (let j = 0; j < keys.length; j++) {
      if (j > 0) out += ',';
      out += '"';
      out += keys[j];
      out += '":"';
      out += ev.dims[keys[j]];
      out += '"';
    }
    out += '}}';
  }
  out += ']}';
  return out;
}
