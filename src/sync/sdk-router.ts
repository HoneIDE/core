/**
 * SDK Router — dispatches API messages to domain handlers.
 * Handles auth scope checking and event subscription.
 */

import type { DomainHandler } from './sdk-handler';

export interface ApiMessage {
  id: string;
  type: 'request' | 'response' | 'event';
  domain: string;
  operation: string;
  payload: Record<string, unknown>;
  error?: { code: string; message: string };
}

export type EventListener = (event: ApiMessage) => void;

export class SdkRouter {
  private handlers: Map<string, DomainHandler> = new Map();
  private eventListeners: Map<string, EventListener[]> = new Map();

  /** Register a domain handler. */
  registerHandler(handler: DomainHandler): void {
    this.handlers.set(handler.domain, handler);
  }

  /** Remove a domain handler. */
  removeHandler(domain: string): void {
    this.handlers.delete(domain);
  }

  /** Get registered domain names. */
  getDomains(): string[] {
    return Array.from(this.handlers.keys());
  }

  /** Route a request message and return a response. */
  async handleRequest(message: ApiMessage, scopes?: string[]): Promise<ApiMessage> {
    // Auth scope check
    if (scopes) {
      if (!scopeAllows(scopes, message.domain, message.operation)) {
        return {
          id: message.id,
          type: 'response',
          domain: message.domain,
          operation: message.operation,
          payload: {},
          error: { code: 'AUTH_DENIED', message: `Scope "${message.domain}.${message.operation}" not allowed` },
        };
      }
    }

    const handler = this.handlers.get(message.domain);
    if (!handler) {
      return {
        id: message.id,
        type: 'response',
        domain: message.domain,
        operation: message.operation,
        payload: {},
        error: { code: 'UNKNOWN_DOMAIN', message: `Unknown domain: ${message.domain}` },
      };
    }

    try {
      const result = await handler.handle(message.operation, message.payload);
      return {
        id: message.id,
        type: 'response',
        domain: message.domain,
        operation: message.operation,
        payload: result,
      };
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : String(err);
      return {
        id: message.id,
        type: 'response',
        domain: message.domain,
        operation: message.operation,
        payload: {},
        error: { code: 'HANDLER_ERROR', message: errorMsg },
      };
    }
  }

  /** Subscribe to events from a domain. Returns unsubscribe function. */
  subscribe(domain: string, operation: string, listener: EventListener): () => void {
    const key = `${domain}.${operation}`;
    let listeners = this.eventListeners.get(key);
    if (!listeners) {
      listeners = [];
      this.eventListeners.set(key, listeners);
    }
    listeners.push(listener);

    return () => {
      const arr = this.eventListeners.get(key);
      if (arr) {
        const idx = arr.indexOf(listener);
        if (idx >= 0) arr.splice(idx, 1);
      }
    };
  }

  /** Emit an event to subscribers. */
  emitEvent(domain: string, operation: string, payload: Record<string, unknown>): void {
    const key = `${domain}.${operation}`;
    const listeners = this.eventListeners.get(key);
    if (!listeners) return;

    const event: ApiMessage = {
      id: 'evt_' + Date.now(),
      type: 'event',
      domain,
      operation,
      payload,
    };

    for (let i = 0; i < listeners.length; i++) {
      listeners[i](event);
    }
  }

  /** Get all subscribable events across all handlers. */
  getSubscribableEvents(): string[] {
    const events: string[] = [];
    this.handlers.forEach((handler, domain) => {
      const ops = handler.getSubscribableEvents();
      for (let i = 0; i < ops.length; i++) {
        events.push(`${domain}.${ops[i]}`);
      }
    });
    return events;
  }
}

/** Check if scopes allow a domain.operation. */
function scopeAllows(scopes: string[], domain: string, operation: string): boolean {
  const wildcard = `${domain}.*`;
  const specific = `${domain}.${operation}`;
  for (let i = 0; i < scopes.length; i++) {
    if (scopes[i] === wildcard || scopes[i] === specific) {
      return true;
    }
  }
  return false;
}
