/**
 * JSON-RPC 2.0 message types and framing for LSP.
 *
 * LSP uses JSON-RPC over stdin/stdout with Content-Length headers:
 *   Content-Length: <length>\r\n
 *   \r\n
 *   <JSON payload>
 */

export interface JsonRpcRequest {
  jsonrpc: '2.0';
  id: number | string;
  method: string;
  params?: unknown;
}

export interface JsonRpcResponse {
  jsonrpc: '2.0';
  id: number | string | null;
  result?: unknown;
  error?: JsonRpcError;
}

export interface JsonRpcNotification {
  jsonrpc: '2.0';
  method: string;
  params?: unknown;
}

export interface JsonRpcError {
  code: number;
  message: string;
  data?: unknown;
}

export type JsonRpcMessage = JsonRpcRequest | JsonRpcResponse | JsonRpcNotification;

// Standard JSON-RPC error codes
export const PARSE_ERROR = -32700;
export const INVALID_REQUEST = -32600;
export const METHOD_NOT_FOUND = -32601;
export const INVALID_PARAMS = -32602;
export const INTERNAL_ERROR = -32603;

// LSP-specific error codes
export const SERVER_NOT_INITIALIZED = -32002;
export const REQUEST_CANCELLED = -32800;
export const CONTENT_MODIFIED = -32801;

/** Create a JSON-RPC request message. */
export function createRequest(id: number, method: string, params?: unknown): JsonRpcRequest {
  const msg: JsonRpcRequest = { jsonrpc: '2.0', id, method };
  if (params !== undefined) msg.params = params;
  return msg;
}

/** Create a JSON-RPC notification (no id, no response expected). */
export function createNotification(method: string, params?: unknown): JsonRpcNotification {
  const msg: JsonRpcNotification = { jsonrpc: '2.0', method };
  if (params !== undefined) msg.params = params;
  return msg;
}

/** Create a JSON-RPC response. */
export function createResponse(id: number | string | null, result: unknown): JsonRpcResponse {
  return { jsonrpc: '2.0', id, result };
}

/** Create a JSON-RPC error response. */
export function createErrorResponse(id: number | string | null, code: number, message: string): JsonRpcResponse {
  return { jsonrpc: '2.0', id, error: { code, message } };
}

/** Encode a JSON-RPC message with Content-Length header for LSP transport. */
export function encodeMessage(msg: JsonRpcMessage): string {
  const body = JSON.stringify(msg);
  return `Content-Length: ${Buffer.byteLength(body, 'utf-8')}\r\n\r\n${body}`;
}

/** Determine if a parsed JSON object is a request (has id + method). */
export function isRequest(msg: unknown): msg is JsonRpcRequest {
  const m = msg as any;
  return m && m.jsonrpc === '2.0' && m.method !== undefined && m.id !== undefined;
}

/** Determine if a parsed JSON object is a notification (has method, no id). */
export function isNotification(msg: unknown): msg is JsonRpcNotification {
  const m = msg as any;
  return m && m.jsonrpc === '2.0' && m.method !== undefined && m.id === undefined;
}

/** Determine if a parsed JSON object is a response (has id, no method). */
export function isResponse(msg: unknown): msg is JsonRpcResponse {
  const m = msg as any;
  return m && m.jsonrpc === '2.0' && m.id !== undefined && m.method === undefined;
}

/**
 * Incremental LSP message parser.
 * Buffers incoming data and emits complete JSON-RPC messages.
 */
export class MessageParser {
  private buffer = '';
  private contentLength = -1;

  /**
   * Feed raw data from the LSP server's stdout.
   * Returns an array of complete messages parsed from the data.
   */
  feed(data: string): JsonRpcMessage[] {
    this.buffer += data;
    const messages: JsonRpcMessage[] = [];

    while (true) {
      if (this.contentLength < 0) {
        // Look for Content-Length header
        const headerEnd = this.buffer.indexOf('\r\n\r\n');
        if (headerEnd < 0) break;

        const header = this.buffer.slice(0, headerEnd);
        const match = header.match(/Content-Length:\s*(\d+)/i);
        if (!match) {
          // Invalid header — skip past it
          this.buffer = this.buffer.slice(headerEnd + 4);
          continue;
        }

        this.contentLength = parseInt(match[1], 10);
        this.buffer = this.buffer.slice(headerEnd + 4);
      }

      // Check if we have enough data for the body
      if (this.buffer.length < this.contentLength) break;

      const body = this.buffer.slice(0, this.contentLength);
      this.buffer = this.buffer.slice(this.contentLength);
      this.contentLength = -1;

      try {
        const msg = JSON.parse(body);
        messages.push(msg);
      } catch {
        // Skip malformed JSON
      }
    }

    return messages;
  }
}
