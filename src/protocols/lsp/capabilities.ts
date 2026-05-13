/**
 * LSP capability types and negotiation helpers.
 */

/** Client capabilities sent during initialize. */
export interface ClientCapabilities {
  textDocument?: {
    completion?: {
      completionItem?: {
        snippetSupport?: boolean;
        commitCharactersSupport?: boolean;
        documentationFormat?: string[];
        deprecatedSupport?: boolean;
        preselectSupport?: boolean;
        insertReplaceSupport?: boolean;
        labelDetailsSupport?: boolean;
      };
      contextSupport?: boolean;
    };
    hover?: {
      contentFormat?: string[];
    };
    signatureHelp?: {
      signatureInformation?: {
        documentationFormat?: string[];
        parameterInformation?: { labelOffsetSupport?: boolean };
      };
    };
    definition?: { linkSupport?: boolean };
    references?: {};
    documentHighlight?: {};
    documentSymbol?: {
      hierarchicalDocumentSymbolSupport?: boolean;
    };
    codeAction?: {
      codeActionLiteralSupport?: {
        codeActionKind?: { valueSet?: string[] };
      };
    };
    formatting?: {};
    rangeFormatting?: {};
    rename?: { prepareSupport?: boolean };
    publishDiagnostics?: {
      relatedInformation?: boolean;
      tagSupport?: { valueSet?: number[] };
    };
    foldingRange?: { lineFoldingOnly?: boolean };
    declaration?: { linkSupport?: boolean };
    typeDefinition?: { linkSupport?: boolean };
    implementation?: { linkSupport?: boolean };
  };
  workspace?: {
    workspaceFolders?: boolean;
    configuration?: boolean;
    didChangeConfiguration?: { dynamicRegistration?: boolean };
  };
}

/** Server capabilities returned from initialize response. */
export interface ServerCapabilities {
  textDocumentSync?: number | { openClose?: boolean; change?: number; save?: { includeText?: boolean } };
  completionProvider?: { triggerCharacters?: string[]; resolveProvider?: boolean };
  hoverProvider?: boolean;
  signatureHelpProvider?: { triggerCharacters?: string[] };
  definitionProvider?: boolean;
  typeDefinitionProvider?: boolean;
  implementationProvider?: boolean;
  referencesProvider?: boolean;
  documentHighlightProvider?: boolean;
  documentSymbolProvider?: boolean;
  codeActionProvider?: boolean | { codeActionKinds?: string[] };
  documentFormattingProvider?: boolean;
  documentRangeFormattingProvider?: boolean;
  renameProvider?: boolean | { prepareProvider?: boolean };
  foldingRangeProvider?: boolean;
  declarationProvider?: boolean;
  workspaceSymbolProvider?: boolean;
  diagnosticProvider?: { interFileDependencies?: boolean; workspaceDiagnostics?: boolean };
}

/** Build default client capabilities for Hone IDE. */
export function buildClientCapabilities(): ClientCapabilities {
  return {
    textDocument: {
      completion: {
        completionItem: {
          snippetSupport: true,
          commitCharactersSupport: true,
          documentationFormat: ['markdown', 'plaintext'],
          deprecatedSupport: true,
          preselectSupport: true,
          insertReplaceSupport: true,
          labelDetailsSupport: true,
        },
        contextSupport: true,
      },
      hover: {
        contentFormat: ['markdown', 'plaintext'],
      },
      signatureHelp: {
        signatureInformation: {
          documentationFormat: ['markdown', 'plaintext'],
          parameterInformation: { labelOffsetSupport: true },
        },
      },
      definition: { linkSupport: true },
      references: {},
      documentHighlight: {},
      documentSymbol: {
        hierarchicalDocumentSymbolSupport: true,
      },
      codeAction: {
        codeActionLiteralSupport: {
          codeActionKind: {
            valueSet: [
              'quickfix',
              'refactor',
              'refactor.extract',
              'refactor.inline',
              'refactor.rewrite',
              'source',
              'source.organizeImports',
            ],
          },
        },
      },
      formatting: {},
      rangeFormatting: {},
      rename: { prepareSupport: true },
      publishDiagnostics: {
        relatedInformation: true,
        tagSupport: { valueSet: [1, 2] }, // Unnecessary=1, Deprecated=2
      },
      foldingRange: { lineFoldingOnly: true },
      declaration: { linkSupport: true },
      typeDefinition: { linkSupport: true },
      implementation: { linkSupport: true },
    },
    workspace: {
      workspaceFolders: true,
      configuration: true,
      didChangeConfiguration: { dynamicRegistration: true },
    },
  };
}

/** Check if server supports a specific capability. */
export function hasCapability(caps: ServerCapabilities, feature: string): boolean {
  switch (feature) {
    case 'completion': return caps.completionProvider !== undefined;
    case 'hover': return caps.hoverProvider === true;
    case 'definition': return caps.definitionProvider === true;
    case 'typeDefinition': return caps.typeDefinitionProvider === true;
    case 'implementation': return caps.implementationProvider === true;
    case 'references': return caps.referencesProvider === true;
    case 'documentHighlight': return caps.documentHighlightProvider === true;
    case 'documentSymbol': return caps.documentSymbolProvider === true;
    case 'codeAction': return caps.codeActionProvider !== undefined && caps.codeActionProvider !== false;
    case 'formatting': return caps.documentFormattingProvider === true;
    case 'rangeFormatting': return caps.documentRangeFormattingProvider === true;
    case 'rename': return caps.renameProvider !== undefined && caps.renameProvider !== false;
    case 'foldingRange': return caps.foldingRangeProvider === true;
    case 'declaration': return caps.declarationProvider === true;
    case 'workspaceSymbol': return caps.workspaceSymbolProvider === true;
    default: return false;
  }
}

/** Get the text document sync kind from server capabilities. */
export function getTextDocumentSyncKind(caps: ServerCapabilities): number {
  if (typeof caps.textDocumentSync === 'number') {
    return caps.textDocumentSync;
  }
  if (typeof caps.textDocumentSync === 'object' && caps.textDocumentSync !== null) {
    return caps.textDocumentSync.change ?? 0;
  }
  return 0; // None
}

// TextDocumentSyncKind constants
export const SYNC_NONE = 0;
export const SYNC_FULL = 1;
export const SYNC_INCREMENTAL = 2;
