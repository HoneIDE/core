/**
 * DAP Client — builds DAP protocol requests.
 */
import { createDapRequest } from './dap-types';
import type { InitializeRequestArguments, LaunchRequestArguments, SetBreakpointsArguments, SourceBreakpoint } from './dap-types';

let nextSeq = 1;
export function resetDapClientSeq(): void { nextSeq = 1; }

export class DapClient {
  initialize(adapterID: string) {
    return createDapRequest(nextSeq++, 'initialize', {
      adapterID,
      linesStartAt1: true,
      columnsStartAt1: true,
      pathFormat: 'path',
      supportsVariableType: true,
      supportsRunInTerminalRequest: true,
    } as InitializeRequestArguments);
  }

  launch(program: string, args?: string[], cwd?: string) {
    return createDapRequest(nextSeq++, 'launch', {
      program,
      args: args ?? [],
      cwd: cwd ?? '',
      noDebug: false,
    } as LaunchRequestArguments);
  }

  attach(port: number) {
    return createDapRequest(nextSeq++, 'attach', { port });
  }

  setBreakpoints(sourcePath: string, breakpoints: SourceBreakpoint[]) {
    return createDapRequest(nextSeq++, 'setBreakpoints', {
      source: { path: sourcePath },
      breakpoints,
    } as SetBreakpointsArguments);
  }

  configurationDone() {
    return createDapRequest(nextSeq++, 'configurationDone', {});
  }

  continue_(threadId: number) {
    return createDapRequest(nextSeq++, 'continue', { threadId });
  }

  stepOver(threadId: number) {
    return createDapRequest(nextSeq++, 'next', { threadId });
  }

  stepIn(threadId: number) {
    return createDapRequest(nextSeq++, 'stepIn', { threadId });
  }

  stepOut(threadId: number) {
    return createDapRequest(nextSeq++, 'stepOut', { threadId });
  }

  threads() {
    return createDapRequest(nextSeq++, 'threads', {});
  }

  stackTrace(threadId: number) {
    return createDapRequest(nextSeq++, 'stackTrace', { threadId, startFrame: 0, levels: 20 });
  }

  scopes(frameId: number) {
    return createDapRequest(nextSeq++, 'scopes', { frameId });
  }

  variables(variablesReference: number) {
    return createDapRequest(nextSeq++, 'variables', { variablesReference });
  }

  disconnect() {
    return createDapRequest(nextSeq++, 'disconnect', { restart: false });
  }
}
