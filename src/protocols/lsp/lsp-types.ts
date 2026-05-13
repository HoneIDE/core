/**
 * Core LSP types — subset of LSP 3.17 types used by Hone.
 */

export interface Position {
  line: number;       // 0-based
  character: number;  // 0-based
}

export interface Range {
  start: Position;
  end: Position;
}

export interface Location {
  uri: string;
  range: Range;
}

export interface TextDocumentIdentifier {
  uri: string;
}

export interface VersionedTextDocumentIdentifier extends TextDocumentIdentifier {
  version: number;
}

export interface TextDocumentItem {
  uri: string;
  languageId: string;
  version: number;
  text: string;
}

export interface TextDocumentPositionParams {
  textDocument: TextDocumentIdentifier;
  position: Position;
}

export interface TextEdit {
  range: Range;
  newText: string;
}

export interface TextDocumentContentChangeEvent {
  range?: Range;
  text: string;
}

// Diagnostic types
export enum DiagnosticSeverity {
  Error = 1,
  Warning = 2,
  Information = 3,
  Hint = 4,
}

export interface Diagnostic {
  range: Range;
  severity?: DiagnosticSeverity;
  code?: number | string;
  source?: string;
  message: string;
  relatedInformation?: DiagnosticRelatedInformation[];
}

export interface DiagnosticRelatedInformation {
  location: Location;
  message: string;
}

// Completion types
export enum CompletionItemKind {
  Text = 1,
  Method = 2,
  Function = 3,
  Constructor = 4,
  Field = 5,
  Variable = 6,
  Class = 7,
  Interface = 8,
  Module = 9,
  Property = 10,
  Unit = 11,
  Value = 12,
  Enum = 13,
  Keyword = 14,
  Snippet = 15,
  Color = 16,
  File = 17,
  Reference = 18,
  Folder = 19,
  EnumMember = 20,
  Constant = 21,
  Struct = 22,
  Event = 23,
  Operator = 24,
  TypeParameter = 25,
}

export interface CompletionItem {
  label: string;
  kind?: CompletionItemKind;
  detail?: string;
  documentation?: string | { kind: string; value: string };
  deprecated?: boolean;
  preselect?: boolean;
  sortText?: string;
  filterText?: string;
  insertText?: string;
  insertTextFormat?: number; // 1=PlainText, 2=Snippet
  textEdit?: TextEdit;
  additionalTextEdits?: TextEdit[];
}

export interface CompletionList {
  isIncomplete: boolean;
  items: CompletionItem[];
}

// Hover types
export interface Hover {
  contents: string | { kind: string; value: string } | Array<string | { language: string; value: string }>;
  range?: Range;
}

// Symbol types
export enum SymbolKind {
  File = 1, Module = 2, Namespace = 3, Package = 4,
  Class = 5, Method = 6, Property = 7, Field = 8,
  Constructor = 9, Enum = 10, Interface = 11, Function = 12,
  Variable = 13, Constant = 14, String = 15, Number = 16,
  Boolean = 17, Array = 18, Object = 19, Key = 20,
  Null = 21, EnumMember = 22, Struct = 23, Event = 24,
  Operator = 25, TypeParameter = 26,
}

export interface DocumentSymbol {
  name: string;
  detail?: string;
  kind: SymbolKind;
  range: Range;
  selectionRange: Range;
  children?: DocumentSymbol[];
}

// Code action types
export interface CodeAction {
  title: string;
  kind?: string;
  diagnostics?: Diagnostic[];
  edit?: WorkspaceEdit;
  command?: Command;
}

export interface Command {
  title: string;
  command: string;
  arguments?: unknown[];
}

export interface WorkspaceEdit {
  changes?: { [uri: string]: TextEdit[] };
}

/** Convert a file path to a file:// URI. */
export function pathToUri(path: string): string {
  // Ensure leading slash on Unix paths
  if (path.startsWith('/')) {
    return `file://${path}`;
  }
  // Windows path: C:\... → file:///C:/...
  return `file:///${path.replace(/\\/g, '/')}`;
}

/** Convert a file:// URI to a file path. */
export function uriToPath(uri: string): string {
  if (uri.startsWith('file:///')) {
    const path = uri.slice(7);
    // Check for Windows drive letter (e.g., /C:/)
    if (path.length >= 3 && path[0] === '/' && path[2] === ':') {
      return path.slice(1).replace(/\//g, '\\');
    }
    return path;
  }
  if (uri.startsWith('file://')) {
    return uri.slice(7);
  }
  return uri;
}

/** Detect language ID from file extension. */
export function detectLanguageId(path: string): string {
  if (path.endsWith('.ts') || path.endsWith('.tsx')) return 'typescript';
  if (path.endsWith('.js') || path.endsWith('.jsx')) return 'javascript';
  if (path.endsWith('.py')) return 'python';
  if (path.endsWith('.rs')) return 'rust';
  if (path.endsWith('.go')) return 'go';
  if (path.endsWith('.java')) return 'java';
  if (path.endsWith('.c') || path.endsWith('.h')) return 'c';
  if (path.endsWith('.cpp') || path.endsWith('.hpp')) return 'cpp';
  if (path.endsWith('.cs')) return 'csharp';
  if (path.endsWith('.rb')) return 'ruby';
  if (path.endsWith('.html') || path.endsWith('.htm')) return 'html';
  if (path.endsWith('.css')) return 'css';
  if (path.endsWith('.json')) return 'json';
  if (path.endsWith('.md')) return 'markdown';
  if (path.endsWith('.yaml') || path.endsWith('.yml')) return 'yaml';
  if (path.endsWith('.xml')) return 'xml';
  if (path.endsWith('.sh') || path.endsWith('.bash')) return 'shellscript';
  if (path.endsWith('.swift')) return 'swift';
  if (path.endsWith('.kt')) return 'kotlin';
  return 'plaintext';
}
