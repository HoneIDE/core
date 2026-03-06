/**
 * Domain handler interface for the SDK router.
 * Each domain (projects, files, editor, ai, build) implements this.
 */

export interface DomainHandler {
  readonly domain: string;
  handle(operation: string, payload: Record<string, unknown>): Promise<Record<string, unknown>>;
  getSubscribableEvents(): string[];
}
