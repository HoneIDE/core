/**
 * Tests for Slice 6: LSP JSON-RPC, capabilities, and types.
 */
import { describe, test, expect, beforeEach } from 'bun:test';
import {
  createRequest, createNotification, createResponse, createErrorResponse,
  encodeMessage, isRequest, isNotification, isResponse,
  MessageParser,
  PARSE_ERROR, METHOD_NOT_FOUND,
} from '../src/protocols/lsp/json-rpc';
import {
  buildClientCapabilities, hasCapability, getTextDocumentSyncKind,
  SYNC_NONE, SYNC_FULL, SYNC_INCREMENTAL,
  type ServerCapabilities,
} from '../src/protocols/lsp/capabilities';
import {
  pathToUri, uriToPath, detectLanguageId,
} from '../src/protocols/lsp/lsp-types';

// =============================================================================
// JSON-RPC message creation
// =============================================================================

describe('createRequest', () => {
  test('creates valid request', () => {
    const req = createRequest(1, 'textDocument/completion', { textDocument: { uri: 'file:///a.ts' } });
    expect(req.jsonrpc).toBe('2.0');
    expect(req.id).toBe(1);
    expect(req.method).toBe('textDocument/completion');
    expect(req.params).toBeDefined();
  });

  test('creates request without params', () => {
    const req = createRequest(2, 'shutdown');
    expect(req.params).toBeUndefined();
  });
});

describe('createNotification', () => {
  test('creates valid notification', () => {
    const notif = createNotification('initialized', {});
    expect(notif.jsonrpc).toBe('2.0');
    expect(notif.method).toBe('initialized');
    expect((notif as any).id).toBeUndefined();
  });
});

describe('createResponse', () => {
  test('creates success response', () => {
    const resp = createResponse(1, { capabilities: {} });
    expect(resp.jsonrpc).toBe('2.0');
    expect(resp.id).toBe(1);
    expect(resp.result).toBeDefined();
    expect(resp.error).toBeUndefined();
  });
});

describe('createErrorResponse', () => {
  test('creates error response', () => {
    const resp = createErrorResponse(1, METHOD_NOT_FOUND, 'Not found');
    expect(resp.error?.code).toBe(-32601);
    expect(resp.error?.message).toBe('Not found');
  });
});

// =============================================================================
// JSON-RPC message classification
// =============================================================================

describe('message classification', () => {
  test('isRequest identifies requests', () => {
    expect(isRequest({ jsonrpc: '2.0', id: 1, method: 'test' })).toBe(true);
    expect(isRequest({ jsonrpc: '2.0', method: 'test' })).toBe(false); // no id
    expect(isRequest({ jsonrpc: '2.0', id: 1, result: {} })).toBe(false); // no method
  });

  test('isNotification identifies notifications', () => {
    expect(isNotification({ jsonrpc: '2.0', method: 'test' })).toBe(true);
    expect(isNotification({ jsonrpc: '2.0', id: 1, method: 'test' })).toBe(false); // has id
  });

  test('isResponse identifies responses', () => {
    expect(isResponse({ jsonrpc: '2.0', id: 1, result: {} })).toBe(true);
    expect(isResponse({ jsonrpc: '2.0', id: 1, error: { code: -1, message: 'err' } })).toBe(true);
    expect(isResponse({ jsonrpc: '2.0', method: 'test' })).toBe(false); // no id
  });
});

// =============================================================================
// Message encoding
// =============================================================================

describe('encodeMessage', () => {
  test('encodes with Content-Length header', () => {
    const msg = createRequest(1, 'initialize');
    const encoded = encodeMessage(msg);
    expect(encoded).toContain('Content-Length: ');
    expect(encoded).toContain('\r\n\r\n');
    expect(encoded).toContain('"jsonrpc":"2.0"');
  });

  test('Content-Length matches body byte length', () => {
    const msg = createNotification('test', { data: 'hello' });
    const encoded = encodeMessage(msg);
    const parts = encoded.split('\r\n\r\n');
    const clMatch = parts[0].match(/Content-Length: (\d+)/);
    expect(clMatch).not.toBeNull();
    const cl = parseInt(clMatch![1], 10);
    const body = parts[1];
    expect(cl).toBe(Buffer.byteLength(body, 'utf-8'));
  });

  test('handles unicode content', () => {
    const msg = createNotification('test', { text: '日本語' });
    const encoded = encodeMessage(msg);
    const parts = encoded.split('\r\n\r\n');
    const cl = parseInt(parts[0].match(/Content-Length: (\d+)/)![1], 10);
    expect(cl).toBe(Buffer.byteLength(parts[1], 'utf-8'));
  });
});

// =============================================================================
// MessageParser
// =============================================================================

describe('MessageParser', () => {
  test('parses single complete message', () => {
    const parser = new MessageParser();
    const body = JSON.stringify({ jsonrpc: '2.0', id: 1, result: null });
    const raw = `Content-Length: ${Buffer.byteLength(body)}\r\n\r\n${body}`;
    const messages = parser.feed(raw);
    expect(messages).toHaveLength(1);
    expect((messages[0] as any).id).toBe(1);
  });

  test('parses message split across multiple feeds', () => {
    const parser = new MessageParser();
    const body = JSON.stringify({ jsonrpc: '2.0', method: 'test' });
    const raw = `Content-Length: ${Buffer.byteLength(body)}\r\n\r\n${body}`;
    // Split in the middle
    const mid = Math.floor(raw.length / 2);
    let messages = parser.feed(raw.slice(0, mid));
    expect(messages).toHaveLength(0);
    messages = parser.feed(raw.slice(mid));
    expect(messages).toHaveLength(1);
  });

  test('parses multiple messages in one feed', () => {
    const parser = new MessageParser();
    const body1 = JSON.stringify({ jsonrpc: '2.0', id: 1, result: 'a' });
    const body2 = JSON.stringify({ jsonrpc: '2.0', id: 2, result: 'b' });
    const raw = `Content-Length: ${Buffer.byteLength(body1)}\r\n\r\n${body1}Content-Length: ${Buffer.byteLength(body2)}\r\n\r\n${body2}`;
    const messages = parser.feed(raw);
    expect(messages).toHaveLength(2);
  });

  test('handles partial header', () => {
    const parser = new MessageParser();
    let messages = parser.feed('Content-Len');
    expect(messages).toHaveLength(0);
    const body = JSON.stringify({ jsonrpc: '2.0', method: 'x' });
    messages = parser.feed(`gth: ${Buffer.byteLength(body)}\r\n\r\n${body}`);
    expect(messages).toHaveLength(1);
  });

  test('handles empty feed', () => {
    const parser = new MessageParser();
    const messages = parser.feed('');
    expect(messages).toHaveLength(0);
  });

  test('skips malformed JSON', () => {
    const parser = new MessageParser();
    const badBody = '{not valid json';
    const raw = `Content-Length: ${Buffer.byteLength(badBody)}\r\n\r\n${badBody}`;
    const messages = parser.feed(raw);
    expect(messages).toHaveLength(0);
  });

  test('recovers after malformed message', () => {
    const parser = new MessageParser();
    const bad = '{bad}';
    const good = JSON.stringify({ jsonrpc: '2.0', id: 1, result: 'ok' });
    const raw = `Content-Length: ${Buffer.byteLength(bad)}\r\n\r\n${bad}Content-Length: ${Buffer.byteLength(good)}\r\n\r\n${good}`;
    const messages = parser.feed(raw);
    expect(messages).toHaveLength(1);
    expect((messages[0] as any).result).toBe('ok');
  });
});

// =============================================================================
// Capabilities
// =============================================================================

describe('buildClientCapabilities', () => {
  test('returns well-formed capabilities', () => {
    const caps = buildClientCapabilities();
    expect(caps.textDocument).toBeDefined();
    expect(caps.textDocument!.completion).toBeDefined();
    expect(caps.textDocument!.hover).toBeDefined();
    expect(caps.workspace).toBeDefined();
    expect(caps.workspace!.workspaceFolders).toBe(true);
  });

  test('includes snippet support', () => {
    const caps = buildClientCapabilities();
    expect(caps.textDocument!.completion!.completionItem!.snippetSupport).toBe(true);
  });
});

describe('hasCapability', () => {
  test('detects completion provider', () => {
    const caps: ServerCapabilities = { completionProvider: { triggerCharacters: ['.'] } };
    expect(hasCapability(caps, 'completion')).toBe(true);
  });

  test('detects hover provider', () => {
    expect(hasCapability({ hoverProvider: true }, 'hover')).toBe(true);
    expect(hasCapability({ hoverProvider: false } as any, 'hover')).toBe(false);
  });

  test('detects definition provider', () => {
    expect(hasCapability({ definitionProvider: true }, 'definition')).toBe(true);
  });

  test('detects code action provider (boolean)', () => {
    expect(hasCapability({ codeActionProvider: true }, 'codeAction')).toBe(true);
  });

  test('detects code action provider (object)', () => {
    expect(hasCapability({ codeActionProvider: { codeActionKinds: ['quickfix'] } }, 'codeAction')).toBe(true);
  });

  test('returns false for missing capability', () => {
    expect(hasCapability({}, 'completion')).toBe(false);
    expect(hasCapability({}, 'hover')).toBe(false);
  });

  test('returns false for unknown feature', () => {
    expect(hasCapability({ hoverProvider: true }, 'unknownFeature')).toBe(false);
  });
});

describe('getTextDocumentSyncKind', () => {
  test('returns number directly', () => {
    expect(getTextDocumentSyncKind({ textDocumentSync: 1 })).toBe(SYNC_FULL);
    expect(getTextDocumentSyncKind({ textDocumentSync: 2 })).toBe(SYNC_INCREMENTAL);
  });

  test('extracts from object', () => {
    expect(getTextDocumentSyncKind({ textDocumentSync: { change: 2 } })).toBe(SYNC_INCREMENTAL);
    expect(getTextDocumentSyncKind({ textDocumentSync: { openClose: true } })).toBe(SYNC_NONE);
  });

  test('returns NONE when missing', () => {
    expect(getTextDocumentSyncKind({})).toBe(SYNC_NONE);
  });
});

// =============================================================================
// LSP Types helpers
// =============================================================================

describe('pathToUri', () => {
  test('converts Unix path', () => {
    expect(pathToUri('/Users/alice/project/file.ts')).toBe('file:///Users/alice/project/file.ts');
  });

  test('converts Windows path', () => {
    expect(pathToUri('C:\\Users\\alice\\file.ts')).toBe('file:///C:/Users/alice/file.ts');
  });
});

describe('uriToPath', () => {
  test('converts Unix URI', () => {
    expect(uriToPath('file:///Users/alice/file.ts')).toBe('/Users/alice/file.ts');
  });

  test('converts Windows URI', () => {
    expect(uriToPath('file:///C:/Users/alice/file.ts')).toBe('C:\\Users\\alice\\file.ts');
  });

  test('handles non-file URI', () => {
    expect(uriToPath('untitled:1')).toBe('untitled:1');
  });
});

describe('detectLanguageId', () => {
  test('detects TypeScript', () => {
    expect(detectLanguageId('app.ts')).toBe('typescript');
    expect(detectLanguageId('app.tsx')).toBe('typescript');
  });

  test('detects JavaScript', () => {
    expect(detectLanguageId('app.js')).toBe('javascript');
  });

  test('detects Python', () => {
    expect(detectLanguageId('main.py')).toBe('python');
  });

  test('detects Rust', () => {
    expect(detectLanguageId('lib.rs')).toBe('rust');
  });

  test('detects HTML', () => {
    expect(detectLanguageId('index.html')).toBe('html');
  });

  test('returns plaintext for unknown', () => {
    expect(detectLanguageId('file.xyz')).toBe('plaintext');
  });
});

// =============================================================================
// LspManager
// =============================================================================

import { LspManager } from '../src/protocols/lsp/lsp-manager';
import type { ServerConfig } from '../src/protocols/lsp/lsp-manager';

describe('LspManager', () => {
  test('registerServer creates starting server', () => {
    const mgr = new LspManager();
    const config: ServerConfig = {
      languageId: 'typescript',
      command: 'typescript-language-server',
      args: ['--stdio'],
      rootUri: 'file:///project',
    };
    const server = mgr.registerServer(config);
    expect(server.languageId).toBe('typescript');
    expect(server.status).toBe('starting');
    expect(server.capabilities).toBeNull();
    expect(server.restartCount).toBe(0);
    expect(mgr.hasServer('typescript')).toBe(true);
  });

  test('markRunning updates status and capabilities', () => {
    const mgr = new LspManager();
    mgr.registerServer({ languageId: 'ts', command: 'tsserver', args: [], rootUri: '' });
    mgr.markRunning('ts', { hoverProvider: true });
    const server = mgr.getServer('ts');
    expect(server!.status).toBe('running');
    expect(server!.capabilities).toEqual({ hoverProvider: true });
  });

  test('markCrashed under limit returns true (should restart)', () => {
    const mgr = new LspManager();
    mgr.setMaxRestarts(2);
    mgr.registerServer({ languageId: 'py', command: 'pyright', args: [], rootUri: '' });
    expect(mgr.markCrashed('py')).toBe(true);
    expect(mgr.getServer('py')!.status).toBe('starting');
    expect(mgr.getServer('py')!.restartCount).toBe(1);
  });

  test('markCrashed over limit returns false (crashed)', () => {
    const mgr = new LspManager();
    mgr.setMaxRestarts(1);
    mgr.registerServer({ languageId: 'rs', command: 'rust-analyzer', args: [], rootUri: '' });
    mgr.markCrashed('rs'); // restartCount=1, still <=1
    const result = mgr.markCrashed('rs'); // restartCount=2, >1
    expect(result).toBe(false);
    expect(mgr.getServer('rs')!.status).toBe('crashed');
  });

  test('removeServer removes a server', () => {
    const mgr = new LspManager();
    mgr.registerServer({ languageId: 'go', command: 'gopls', args: [], rootUri: '' });
    mgr.removeServer('go');
    expect(mgr.hasServer('go')).toBe(false);
    expect(mgr.getServer('go')).toBeUndefined();
  });

  test('getAllServers returns all registered servers', () => {
    const mgr = new LspManager();
    mgr.registerServer({ languageId: 'ts', command: 'tsserver', args: [], rootUri: '' });
    mgr.registerServer({ languageId: 'py', command: 'pyright', args: [], rootUri: '' });
    const all = mgr.getAllServers();
    expect(all).toHaveLength(2);
    const ids = all.map(s => s.languageId).sort();
    expect(ids).toEqual(['py', 'ts']);
  });
});

// =============================================================================
// LspClient
// =============================================================================

import { LspClient, resetLspClientIds } from '../src/protocols/lsp/lsp-client';

describe('LspClient', () => {
  let client: LspClient;

  beforeEach(() => {
    resetLspClientIds();
    client = new LspClient('/Users/alice/project');
  });

  test('initialize creates proper request', () => {
    const req = client.initialize();
    expect(req.jsonrpc).toBe('2.0');
    expect(req.id).toBe(1);
    expect(req.method).toBe('initialize');
    const params = req.params as any;
    expect(params.rootUri).toBe('file:///Users/alice/project');
    expect(params.capabilities.textDocument).toBeDefined();
    expect(params.capabilities.workspace).toBeDefined();
  });

  test('initialized creates notification', () => {
    const notif = client.initialized();
    expect(notif.method).toBe('initialized');
    expect((notif as any).id).toBeUndefined();
  });

  test('shutdown creates request', () => {
    const req = client.shutdown();
    expect(req.method).toBe('shutdown');
    expect(req.id).toBe(1);
  });

  test('didOpen creates notification', () => {
    const notif = client.didOpen('file:///a.ts', 'typescript', 1, 'const x = 1;');
    expect(notif.method).toBe('textDocument/didOpen');
    const params = notif.params as any;
    expect(params.textDocument.uri).toBe('file:///a.ts');
    expect(params.textDocument.languageId).toBe('typescript');
    expect(params.textDocument.version).toBe(1);
    expect(params.textDocument.text).toBe('const x = 1;');
  });

  test('didChange creates notification', () => {
    const notif = client.didChange('file:///a.ts', 2, [{ text: 'const y = 2;' }]);
    expect(notif.method).toBe('textDocument/didChange');
    const params = notif.params as any;
    expect(params.textDocument.uri).toBe('file:///a.ts');
    expect(params.textDocument.version).toBe(2);
    expect(params.contentChanges).toHaveLength(1);
  });

  test('completion creates request with position', () => {
    const req = client.completion('file:///a.ts', { line: 5, character: 10 });
    expect(req.method).toBe('textDocument/completion');
    const params = req.params as any;
    expect(params.textDocument.uri).toBe('file:///a.ts');
    expect(params.position.line).toBe(5);
    expect(params.position.character).toBe(10);
  });

  test('hover creates request', () => {
    const req = client.hover('file:///a.ts', { line: 3, character: 7 });
    expect(req.method).toBe('textDocument/hover');
    const params = req.params as any;
    expect(params.position.line).toBe(3);
  });

  test('definition creates request', () => {
    const req = client.definition('file:///a.ts', { line: 1, character: 0 });
    expect(req.method).toBe('textDocument/definition');
  });

  test('references creates request with includeDeclaration', () => {
    const req = client.references('file:///a.ts', { line: 1, character: 0 });
    expect(req.method).toBe('textDocument/references');
    const params = req.params as any;
    expect(params.context.includeDeclaration).toBe(true);
  });
});
