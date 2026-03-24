/**
 * Extension registry — discovery, registration, and lifecycle tracking.
 *
 * Built-in language support configuration — separate from the v2 plugin
 * system (hone-extension/). Manages state for the 11 built-in language
 * bundles in hone-extensions/.
 */

import type { ExtensionManifest } from './manifest';

export type ExtensionState = 'installed' | 'active' | 'inactive' | 'error';

export interface RegisteredExtension {
  manifest: ExtensionManifest;
  state: ExtensionState;
  /** Absolute path to the extension directory */
  path: string;
  /** Error message if state is 'error' */
  error?: string;
  /** When the extension was activated */
  activatedAt?: number;
}

export class ExtensionRegistry {
  private extensions: RegisteredExtension[] = [];
  private _byId: Map<string, RegisteredExtension> = new Map();

  /** Register an extension. */
  register(manifest: ExtensionManifest, extensionPath: string): RegisteredExtension {
    // Check for duplicate via Map (O(1))
    const existing = this._byId.get(manifest.id);
    if (existing) {
      existing.manifest = manifest;
      existing.path = extensionPath;
      return existing;
    }

    const entry: RegisteredExtension = {
      manifest,
      state: 'installed',
      path: extensionPath,
    };
    this.extensions.push(entry);
    this._byId.set(manifest.id, entry);
    return entry;
  }

  /** Unregister an extension by ID. */
  unregister(id: string): boolean {
    if (!this._byId.has(id)) return false;
    this._byId.delete(id);
    for (let i = 0; i < this.extensions.length; i++) {
      if (this.extensions[i].manifest.id === id) {
        this.extensions.splice(i, 1);
        return true;
      }
    }
    return false;
  }

  /** Get an extension by ID. */
  get(id: string): RegisteredExtension | null {
    return this._byId.get(id) || null;
  }

  /** Get all registered extensions. */
  getAll(): RegisteredExtension[] {
    return this.extensions.slice();
  }

  /** Get extensions by state. */
  getByState(state: ExtensionState): RegisteredExtension[] {
    const result: RegisteredExtension[] = [];
    for (let i = 0; i < this.extensions.length; i++) {
      if (this.extensions[i].state === state) result.push(this.extensions[i]);
    }
    return result;
  }

  /** Get extensions by category. */
  getByCategory(category: string): RegisteredExtension[] {
    const result: RegisteredExtension[] = [];
    for (let i = 0; i < this.extensions.length; i++) {
      const cats = this.extensions[i].manifest.categories;
      for (let j = 0; j < cats.length; j++) {
        if (cats[j] === category) {
          result.push(this.extensions[i]);
          break;
        }
      }
    }
    return result;
  }

  /** Mark an extension as activated. */
  activate(id: string): boolean {
    const ext = this.get(id);
    if (!ext) return false;
    ext.state = 'active';
    ext.activatedAt = Date.now();
    ext.error = undefined;
    return true;
  }

  /** Mark an extension as deactivated. */
  deactivate(id: string): boolean {
    const ext = this.get(id);
    if (!ext) return false;
    ext.state = 'inactive';
    return true;
  }

  /** Mark an extension as errored. */
  setError(id: string, error: string): boolean {
    const ext = this.get(id);
    if (!ext) return false;
    ext.state = 'error';
    ext.error = error;
    return true;
  }

  /** Check if an activation event matches any extension. */
  findByActivationEvent(event: string): RegisteredExtension[] {
    const result: RegisteredExtension[] = [];
    for (let i = 0; i < this.extensions.length; i++) {
      const ext = this.extensions[i];
      if (ext.state === 'active') continue; // Already active
      const events = ext.manifest.activationEvents;
      for (let j = 0; j < events.length; j++) {
        if (events[j] === event || events[j] === '*') {
          result.push(ext);
          break;
        }
      }
    }
    return result;
  }

  /** Search extensions by name or description. */
  search(query: string): RegisteredExtension[] {
    const lower = query.toLowerCase();
    const result: RegisteredExtension[] = [];
    for (let i = 0; i < this.extensions.length; i++) {
      const ext = this.extensions[i];
      if (ext.manifest.name.toLowerCase().indexOf(lower) >= 0 ||
          ext.manifest.description.toLowerCase().indexOf(lower) >= 0) {
        result.push(ext);
      }
    }
    return result;
  }

  /** Get extension count. */
  get count(): number {
    return this.extensions.length;
  }

  /** Check if an extension is registered. */
  has(id: string): boolean {
    return this.get(id) !== null;
  }

  /** Get all contributed commands across all active extensions. */
  getAllCommands(): { extensionId: string; command: string; title: string }[] {
    const result: { extensionId: string; command: string; title: string }[] = [];
    for (let i = 0; i < this.extensions.length; i++) {
      const ext = this.extensions[i];
      if (ext.state !== 'active') continue;
      const commands = ext.manifest.contributes.commands;
      if (!commands) continue;
      for (let j = 0; j < commands.length; j++) {
        result.push({
          extensionId: ext.manifest.id,
          command: commands[j].command,
          title: commands[j].title,
        });
      }
    }
    return result;
  }
}
