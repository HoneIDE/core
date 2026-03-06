import { describe, test, expect, beforeEach } from 'bun:test';
import { SdkRouter, type ApiMessage } from '../src/sync/sdk-router';
import type { DomainHandler } from '../src/sync/sdk-handler';

class MockHandler implements DomainHandler {
  readonly domain: string;
  private result: Record<string, unknown>;
  lastOp: string = '';
  lastPayload: Record<string, unknown> = {};

  constructor(domain: string, result: Record<string, unknown> = { ok: true }) {
    this.domain = domain;
    this.result = result;
  }

  async handle(operation: string, payload: Record<string, unknown>): Promise<Record<string, unknown>> {
    this.lastOp = operation;
    this.lastPayload = payload;
    if (operation === 'error') {
      throw new Error('Handler error');
    }
    return this.result;
  }

  getSubscribableEvents(): string[] {
    return ['onChanged', 'onUpdate'];
  }
}

function makeRequest(domain: string, operation: string, payload: Record<string, unknown> = {}): ApiMessage {
  return { id: 'req_1', type: 'request', domain, operation, payload };
}

describe('SdkRouter', () => {
  let router: SdkRouter;
  let projectsHandler: MockHandler;
  let filesHandler: MockHandler;

  beforeEach(() => {
    router = new SdkRouter();
    projectsHandler = new MockHandler('projects', { projects: [] });
    filesHandler = new MockHandler('files', { content: 'hello' });
    router.registerHandler(projectsHandler);
    router.registerHandler(filesHandler);
  });

  // --- Routing ---

  test('routes to correct handler by domain', async () => {
    const resp = await router.handleRequest(makeRequest('projects', 'list'));
    expect(resp.type).toBe('response');
    expect(resp.payload).toEqual({ projects: [] });
    expect(projectsHandler.lastOp).toBe('list');
  });

  test('routes files domain', async () => {
    const resp = await router.handleRequest(makeRequest('files', 'read', { path: 'test.ts' }));
    expect(resp.payload).toEqual({ content: 'hello' });
    expect(filesHandler.lastPayload).toEqual({ path: 'test.ts' });
  });

  test('returns error for unknown domain', async () => {
    const resp = await router.handleRequest(makeRequest('unknown', 'list'));
    expect(resp.error).toBeDefined();
    expect(resp.error!.code).toBe('UNKNOWN_DOMAIN');
  });

  test('returns error on handler exception', async () => {
    const resp = await router.handleRequest(makeRequest('projects', 'error'));
    expect(resp.error).toBeDefined();
    expect(resp.error!.code).toBe('HANDLER_ERROR');
    expect(resp.error!.message).toBe('Handler error');
  });

  test('response has same id as request', async () => {
    const resp = await router.handleRequest(makeRequest('projects', 'list'));
    expect(resp.id).toBe('req_1');
  });

  test('response domain and operation match request', async () => {
    const resp = await router.handleRequest(makeRequest('projects', 'list'));
    expect(resp.domain).toBe('projects');
    expect(resp.operation).toBe('list');
  });

  // --- Handler management ---

  test('getDomains returns registered domains', () => {
    expect(router.getDomains()).toContain('projects');
    expect(router.getDomains()).toContain('files');
  });

  test('removeHandler removes domain', async () => {
    router.removeHandler('files');
    const resp = await router.handleRequest(makeRequest('files', 'read'));
    expect(resp.error).toBeDefined();
    expect(resp.error!.code).toBe('UNKNOWN_DOMAIN');
  });

  // --- Auth scope checking ---

  test('allows request with matching wildcard scope', async () => {
    const resp = await router.handleRequest(makeRequest('files', 'read'), ['files.*']);
    expect(resp.error).toBeUndefined();
  });

  test('allows request with matching specific scope', async () => {
    const resp = await router.handleRequest(makeRequest('files', 'read'), ['files.read']);
    expect(resp.error).toBeUndefined();
  });

  test('denies request without matching scope', async () => {
    const resp = await router.handleRequest(makeRequest('files', 'read'), ['projects.list']);
    expect(resp.error).toBeDefined();
    expect(resp.error!.code).toBe('AUTH_DENIED');
  });

  test('allows request with multiple scopes where one matches', async () => {
    const resp = await router.handleRequest(makeRequest('files', 'read'), ['projects.list', 'files.*']);
    expect(resp.error).toBeUndefined();
  });

  test('denies when scopes array is empty', async () => {
    const resp = await router.handleRequest(makeRequest('files', 'read'), []);
    expect(resp.error).toBeDefined();
    expect(resp.error!.code).toBe('AUTH_DENIED');
  });

  test('no auth check when scopes undefined', async () => {
    const resp = await router.handleRequest(makeRequest('files', 'read'));
    expect(resp.error).toBeUndefined();
  });

  // --- Events ---

  test('subscribe receives events', () => {
    let received: ApiMessage | null = null;
    router.subscribe('projects', 'onChanged', (evt) => { received = evt; });

    router.emitEvent('projects', 'onChanged', { type: 'added' });
    expect(received).not.toBeNull();
    expect(received!.domain).toBe('projects');
    expect(received!.operation).toBe('onChanged');
    expect(received!.payload).toEqual({ type: 'added' });
  });

  test('unsubscribe stops events', () => {
    let count = 0;
    const unsub = router.subscribe('projects', 'onChanged', () => { count++; });

    router.emitEvent('projects', 'onChanged', {});
    expect(count).toBe(1);

    unsub();
    router.emitEvent('projects', 'onChanged', {});
    expect(count).toBe(1);
  });

  test('multiple subscribers receive same event', () => {
    let count = 0;
    router.subscribe('files', 'onChanged', () => { count++; });
    router.subscribe('files', 'onChanged', () => { count++; });

    router.emitEvent('files', 'onChanged', {});
    expect(count).toBe(2);
  });

  test('getSubscribableEvents lists all events', () => {
    const events = router.getSubscribableEvents();
    expect(events).toContain('projects.onChanged');
    expect(events).toContain('projects.onUpdate');
    expect(events).toContain('files.onChanged');
  });

  // --- Payload pass-through ---

  test('payload is passed through to handler', async () => {
    await router.handleRequest(makeRequest('files', 'read', { path: 'test.ts', encoding: 'utf-8' }));
    expect(filesHandler.lastPayload).toEqual({ path: 'test.ts', encoding: 'utf-8' });
  });
});
