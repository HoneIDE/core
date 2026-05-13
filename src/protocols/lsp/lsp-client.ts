/**
 * LSP Client — builds JSON-RPC requests for common LSP operations.
 */
import { createRequest, createNotification } from './json-rpc';
import { pathToUri } from './lsp-types';
import type { Position, TextDocumentContentChangeEvent } from './lsp-types';

let nextId = 1;
export function resetLspClientIds(): void { nextId = 1; }

export class LspClient {
  private rootUri: string;

  constructor(rootPath: string) {
    this.rootUri = pathToUri(rootPath);
  }

  initialize() {
    return createRequest(nextId++, 'initialize', {
      processId: null,
      rootUri: this.rootUri,
      capabilities: {
        textDocument: {
          completion: { completionItem: { snippetSupport: true } },
          hover: { contentFormat: ['markdown', 'plaintext'] },
          definition: {},
          references: {},
          diagnostics: {},
        },
        workspace: {
          workspaceFolders: true,
        },
      },
    });
  }

  initialized() {
    return createNotification('initialized', {});
  }

  shutdown() {
    return createRequest(nextId++, 'shutdown', null);
  }

  exit() {
    return createNotification('exit', null);
  }

  didOpen(uri: string, languageId: string, version: number, text: string) {
    return createNotification('textDocument/didOpen', {
      textDocument: { uri, languageId, version, text },
    });
  }

  didChange(uri: string, version: number, changes: TextDocumentContentChangeEvent[]) {
    return createNotification('textDocument/didChange', {
      textDocument: { uri, version },
      contentChanges: changes,
    });
  }

  didClose(uri: string) {
    return createNotification('textDocument/didClose', {
      textDocument: { uri },
    });
  }

  completion(uri: string, position: Position) {
    return createRequest(nextId++, 'textDocument/completion', {
      textDocument: { uri },
      position,
    });
  }

  hover(uri: string, position: Position) {
    return createRequest(nextId++, 'textDocument/hover', {
      textDocument: { uri },
      position,
    });
  }

  definition(uri: string, position: Position) {
    return createRequest(nextId++, 'textDocument/definition', {
      textDocument: { uri },
      position,
    });
  }

  references(uri: string, position: Position) {
    return createRequest(nextId++, 'textDocument/references', {
      textDocument: { uri },
      position,
      context: { includeDeclaration: true },
    });
  }

  formatting(uri: string) {
    return createRequest(nextId++, 'textDocument/formatting', {
      textDocument: { uri },
      options: { tabSize: 2, insertSpaces: true },
    });
  }
}
