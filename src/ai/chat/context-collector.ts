/**
 * Auto-collect context for AI chat: open files, errors, terminal, git.
 */

export interface ContextItem {
  type: 'file' | 'selection' | 'diagnostics' | 'terminal' | 'git_diff' | 'custom';
  label: string;
  content: string;
  /** Whether this item is included in the context */
  included: boolean;
}

export interface ContextSnapshot {
  items: ContextItem[];
  /** Total estimated tokens across included items */
  estimatedTokens: number;
}

export class ContextCollector {
  private items: ContextItem[] = [];

  /** Add a file to the context. */
  addFile(filePath: string, content: string): void {
    this.items.push({
      type: 'file',
      label: filePath,
      content,
      included: true,
    });
  }

  /** Add a text selection. */
  addSelection(filePath: string, selection: string, startLine: number, endLine: number): void {
    this.items.push({
      type: 'selection',
      label: `${filePath}:${startLine}-${endLine}`,
      content: selection,
      included: true,
    });
  }

  /** Add diagnostics/errors. */
  addDiagnostics(filePath: string, diagnostics: string): void {
    this.items.push({
      type: 'diagnostics',
      label: `Errors in ${filePath}`,
      content: diagnostics,
      included: true,
    });
  }

  /** Add terminal output. */
  addTerminalOutput(output: string): void {
    this.items.push({
      type: 'terminal',
      label: 'Terminal Output',
      content: output,
      included: true,
    });
  }

  /** Add git diff. */
  addGitDiff(diff: string): void {
    this.items.push({
      type: 'git_diff',
      label: 'Git Diff',
      content: diff,
      included: true,
    });
  }

  /** Add a custom context item. */
  addCustom(label: string, content: string): void {
    this.items.push({
      type: 'custom',
      label,
      content,
      included: true,
    });
  }

  /** Toggle inclusion of an item by index. */
  toggleItem(index: number): boolean {
    if (index < 0 || index >= this.items.length) return false;
    this.items[index].included = !this.items[index].included;
    return true;
  }

  /** Remove an item by index. */
  removeItem(index: number): boolean {
    if (index < 0 || index >= this.items.length) return false;
    this.items.splice(index, 1);
    return true;
  }

  /** Clear all items. */
  clear(): void {
    this.items.length = 0;
  }

  /** Get included items count. */
  getIncludedCount(): number {
    let count = 0;
    for (let i = 0; i < this.items.length; i++) {
      if (this.items[i].included) count++;
    }
    return count;
  }

  /** Get all items. */
  getItems(): ContextItem[] {
    return this.items.slice();
  }

  /** Get a snapshot of the current context. */
  getSnapshot(): ContextSnapshot {
    let totalTokens = 0;
    for (let i = 0; i < this.items.length; i++) {
      if (this.items[i].included) {
        // Rough estimate: ~4 chars per token
        totalTokens += Math.ceil(this.items[i].content.length / 4);
      }
    }
    return {
      items: this.items.slice(),
      estimatedTokens: totalTokens,
    };
  }

  /**
   * Build a system prompt section from included context items.
   */
  buildContextPrompt(): string {
    const parts: string[] = [];
    for (let i = 0; i < this.items.length; i++) {
      const item = this.items[i];
      if (!item.included) continue;

      if (item.type === 'file') {
        parts.push(`<file path="${item.label}">\n${item.content}\n</file>`);
      } else if (item.type === 'selection') {
        parts.push(`<selection from="${item.label}">\n${item.content}\n</selection>`);
      } else if (item.type === 'diagnostics') {
        parts.push(`<diagnostics>\n${item.content}\n</diagnostics>`);
      } else if (item.type === 'terminal') {
        parts.push(`<terminal>\n${item.content}\n</terminal>`);
      } else if (item.type === 'git_diff') {
        parts.push(`<git_diff>\n${item.content}\n</git_diff>`);
      } else {
        parts.push(`<context label="${item.label}">\n${item.content}\n</context>`);
      }
    }
    return parts.join('\n\n');
  }

  /** Total item count. */
  get count(): number {
    return this.items.length;
  }
}
