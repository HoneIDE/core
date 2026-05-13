/**
 * Debug Adapter Protocol types — core subset for Hone IDE.
 *
 * DAP uses a similar transport to LSP (Content-Length framing)
 * but with a different message structure (seq, type, command/event).
 */

// ---------------------------------------------------------------------------
// Base protocol
// ---------------------------------------------------------------------------

export interface DapRequest {
  seq: number;
  type: 'request';
  command: string;
  arguments?: unknown;
}

export interface DapResponse {
  seq: number;
  type: 'response';
  request_seq: number;
  success: boolean;
  command: string;
  message?: string;
  body?: unknown;
}

export interface DapEvent {
  seq: number;
  type: 'event';
  event: string;
  body?: unknown;
}

export type DapMessage = DapRequest | DapResponse | DapEvent;

/** Create a DAP request. */
export function createDapRequest(seq: number, command: string, args?: unknown): DapRequest {
  const msg: DapRequest = { seq, type: 'request', command };
  if (args !== undefined) msg.arguments = args;
  return msg;
}

/** Create a DAP response. */
export function createDapResponse(seq: number, requestSeq: number, command: string, success: boolean, body?: unknown): DapResponse {
  const msg: DapResponse = { seq, type: 'response', request_seq: requestSeq, success, command };
  if (body !== undefined) msg.body = body;
  return msg;
}

/** Determine message type. */
export function isDapRequest(msg: unknown): msg is DapRequest {
  return (msg as any)?.type === 'request';
}

export function isDapResponse(msg: unknown): msg is DapResponse {
  return (msg as any)?.type === 'response';
}

export function isDapEvent(msg: unknown): msg is DapEvent {
  return (msg as any)?.type === 'event';
}

/** Encode a DAP message with Content-Length header. */
export function encodeDapMessage(msg: DapMessage): string {
  const body = JSON.stringify(msg);
  return `Content-Length: ${Buffer.byteLength(body, 'utf-8')}\r\n\r\n${body}`;
}

// ---------------------------------------------------------------------------
// Breakpoints
// ---------------------------------------------------------------------------

export interface SourceBreakpoint {
  line: number;
  column?: number;
  condition?: string;
  hitCondition?: string;
  logMessage?: string;
}

export interface Breakpoint {
  id?: number;
  verified: boolean;
  message?: string;
  source?: Source;
  line?: number;
  column?: number;
}

export interface Source {
  name?: string;
  path?: string;
  sourceReference?: number;
}

// ---------------------------------------------------------------------------
// Debug state types
// ---------------------------------------------------------------------------

export interface Thread {
  id: number;
  name: string;
}

export interface StackFrame {
  id: number;
  name: string;
  source?: Source;
  line: number;
  column: number;
}

export interface Scope {
  name: string;
  variablesReference: number;
  expensive: boolean;
}

export interface Variable {
  name: string;
  value: string;
  type?: string;
  variablesReference: number;  // >0 if has children
}

// ---------------------------------------------------------------------------
// Event bodies
// ---------------------------------------------------------------------------

export interface StoppedEventBody {
  reason: 'step' | 'breakpoint' | 'exception' | 'pause' | 'entry' | 'goto' | 'function breakpoint' | 'data breakpoint';
  threadId?: number;
  text?: string;
  allThreadsStopped?: boolean;
}

export interface OutputEventBody {
  category?: 'console' | 'stdout' | 'stderr' | 'telemetry';
  output: string;
  source?: Source;
  line?: number;
}

export interface TerminatedEventBody {
  restart?: boolean;
}

// ---------------------------------------------------------------------------
// DAP commands (request arguments & response bodies)
// ---------------------------------------------------------------------------

export interface InitializeRequestArguments {
  clientID?: string;
  clientName?: string;
  adapterID: string;
  pathFormat?: 'path' | 'uri';
  linesStartAt1?: boolean;
  columnsStartAt1?: boolean;
  supportsVariableType?: boolean;
  supportsVariablePaging?: boolean;
}

export interface LaunchRequestArguments {
  program?: string;
  args?: string[];
  cwd?: string;
  env?: { [key: string]: string };
  noDebug?: boolean;
  [key: string]: unknown;  // adapter-specific
}

export interface AttachRequestArguments {
  [key: string]: unknown;  // adapter-specific
}

export interface SetBreakpointsArguments {
  source: Source;
  breakpoints?: SourceBreakpoint[];
}

export interface SetBreakpointsResponseBody {
  breakpoints: Breakpoint[];
}

export interface ContinueArguments {
  threadId: number;
}

export interface StepArguments {
  threadId: number;
  granularity?: 'statement' | 'line' | 'instruction';
}

export interface StackTraceArguments {
  threadId: number;
  startFrame?: number;
  levels?: number;
}

export interface StackTraceResponseBody {
  stackFrames: StackFrame[];
  totalFrames?: number;
}

export interface ScopesArguments {
  frameId: number;
}

export interface ScopesResponseBody {
  scopes: Scope[];
}

export interface VariablesArguments {
  variablesReference: number;
  start?: number;
  count?: number;
}

export interface VariablesResponseBody {
  variables: Variable[];
}
