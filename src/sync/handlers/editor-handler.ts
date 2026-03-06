/**
 * Editor domain handler — tab, cursor, and viewport state.
 * Thin state container (no real editor dependency).
 */

import type { DomainHandler } from '../sdk-handler';

export interface TabState {
  id: string;
  filePath: string;
  fileName: string;
  isActive: boolean;
  isDirty: boolean;
}

export interface CursorState {
  tabId: string;
  line: number;
  column: number;
}

export interface ViewportState {
  tabId: string;
  startLine: number;
  endLine: number;
}

let nextTabId = 1;
export function resetEditorHandlerIds(): void { nextTabId = 1; }

export class EditorHandler implements DomainHandler {
  readonly domain = 'editor';
  private tabs: TabState[] = [];
  private cursors: Map<string, CursorState> = new Map();
  private viewports: Map<string, ViewportState> = new Map();

  async handle(operation: string, payload: Record<string, unknown>): Promise<Record<string, unknown>> {
    switch (operation) {
      case 'openTabs':
        return { tabs: this.tabs.slice() };
      case 'openFile':
        return this.openFile(payload);
      case 'closeFile':
        return this.closeFile(payload);
      case 'cursor':
        return this.getCursor(payload);
      case 'setCursor':
        return this.setCursor(payload);
      case 'viewport':
        return this.getViewport(payload);
      default:
        throw new Error(`Unknown operation: editor.${operation}`);
    }
  }

  getSubscribableEvents(): string[] {
    return ['onTabChanged'];
  }

  private openFile(payload: Record<string, unknown>): Record<string, unknown> {
    const filePath = payload.path as string;
    const parts = filePath.split('/');
    const fileName = parts[parts.length - 1];

    // Check if already open
    for (let i = 0; i < this.tabs.length; i++) {
      if (this.tabs[i].filePath === filePath) {
        this.setActiveTab(this.tabs[i].id);
        return { tab: this.tabs[i] };
      }
    }

    // Deactivate current
    for (let i = 0; i < this.tabs.length; i++) {
      this.tabs[i].isActive = false;
    }

    const tab: TabState = {
      id: 'tab_' + (nextTabId++),
      filePath,
      fileName,
      isActive: true,
      isDirty: false,
    };
    this.tabs.push(tab);

    // Set cursor to start
    this.cursors.set(tab.id, { tabId: tab.id, line: payload.line as number || 1, column: payload.column as number || 1 });
    this.viewports.set(tab.id, { tabId: tab.id, startLine: 1, endLine: 50 });

    return { tab };
  }

  private closeFile(payload: Record<string, unknown>): Record<string, unknown> {
    const tabId = payload.tabId as string;
    for (let i = 0; i < this.tabs.length; i++) {
      if (this.tabs[i].id === tabId) {
        const wasActive = this.tabs[i].isActive;
        this.tabs.splice(i, 1);
        this.cursors.delete(tabId);
        this.viewports.delete(tabId);
        if (wasActive && this.tabs.length > 0) {
          this.tabs[Math.min(i, this.tabs.length - 1)].isActive = true;
        }
        return { success: true };
      }
    }
    return { success: false };
  }

  private getCursor(payload: Record<string, unknown>): Record<string, unknown> {
    const tabId = (payload.tabId as string) || this.getActiveTabId();
    if (!tabId) return { tabId: '', position: { line: 1, column: 1 } };
    const cursor = this.cursors.get(tabId);
    return {
      tabId,
      position: cursor ? { line: cursor.line, column: cursor.column } : { line: 1, column: 1 },
    };
  }

  private setCursor(payload: Record<string, unknown>): Record<string, unknown> {
    const tabId = payload.tabId as string;
    const position = payload.position as { line: number; column: number };
    this.cursors.set(tabId, { tabId, line: position.line, column: position.column });
    return { success: true };
  }

  private getViewport(payload: Record<string, unknown>): Record<string, unknown> {
    const tabId = (payload.tabId as string) || this.getActiveTabId();
    if (!tabId) return { tabId: '', range: { startLine: 1, endLine: 50 } };
    const vp = this.viewports.get(tabId);
    return {
      tabId,
      range: vp ? { startLine: vp.startLine, endLine: vp.endLine } : { startLine: 1, endLine: 50 },
    };
  }

  private setActiveTab(tabId: string): void {
    for (let i = 0; i < this.tabs.length; i++) {
      this.tabs[i].isActive = this.tabs[i].id === tabId;
    }
  }

  private getActiveTabId(): string {
    for (let i = 0; i < this.tabs.length; i++) {
      if (this.tabs[i].isActive) return this.tabs[i].id;
    }
    return '';
  }
}
