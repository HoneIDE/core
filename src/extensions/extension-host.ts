/**
 * Extension host — manages the lifecycle of extensions.
 *
 * Handles activation, deactivation, and event dispatching.
 *
 * Built-in language support configuration — separate from the v2 plugin
 * system (hone-extension/). This host manages the 11 built-in language
 * bundles in hone-extensions/.
 */

import { ExtensionRegistry } from './registry';
import type { RegisteredExtension } from './registry';
import type { ExtensionManifest } from './manifest';

export interface ExtensionAPI {
  /** Commands namespace */
  commands: {
    registerCommand: (id: string, handler: (...args: unknown[]) => unknown) => void;
    executeCommand: (id: string, ...args: unknown[]) => unknown;
  };
  /** Workspace namespace */
  workspace: {
    rootPath: string;
  };
}

export interface ExtensionActivation {
  /** Dispose function to clean up */
  dispose?: () => void;
}

export class ExtensionHost {
  readonly registry: ExtensionRegistry;
  private commandHandlers: Map<string, (...args: unknown[]) => unknown> = new Map();
  private disposers: Map<string, () => void> = new Map();
  private workspaceRoot = '';

  constructor() {
    this.registry = new ExtensionRegistry();
  }

  /** Set the workspace root path. */
  setWorkspaceRoot(path: string): void {
    this.workspaceRoot = path;
  }

  /**
   * Install an extension from its manifest.
   */
  install(manifest: ExtensionManifest, extensionPath: string): RegisteredExtension {
    return this.registry.register(manifest, extensionPath);
  }

  /**
   * Activate an extension by ID.
   * In a real implementation, this would load and execute the extension's main module.
   * Here we just track the lifecycle.
   */
  activate(id: string): boolean {
    const ext = this.registry.get(id);
    if (!ext) return false;
    if (ext.state === 'active') return true;

    return this.registry.activate(id);
  }

  /** Deactivate an extension by ID. */
  deactivate(id: string): boolean {
    const disposer = this.disposers.get(id);
    if (disposer) {
      try {
        disposer();
      } catch {
        // Ignore dispose errors
      }
      this.disposers.delete(id);
    }

    // Remove commands registered by this extension
    const ext = this.registry.get(id);
    if (ext && ext.manifest.contributes.commands) {
      for (const cmd of ext.manifest.contributes.commands) {
        this.commandHandlers.delete(cmd.command);
      }
    }

    return this.registry.deactivate(id);
  }

  /** Uninstall an extension. */
  uninstall(id: string): boolean {
    this.deactivate(id);
    return this.registry.unregister(id);
  }

  /** Register a command handler. */
  registerCommand(commandId: string, handler: (...args: unknown[]) => unknown): void {
    this.commandHandlers.set(commandId, handler);
  }

  /** Execute a registered command. */
  executeCommand(commandId: string, ...args: unknown[]): unknown {
    const handler = this.commandHandlers.get(commandId);
    if (!handler) return undefined;
    return handler(...args);
  }

  /** Check if a command is registered. */
  hasCommand(commandId: string): boolean {
    return this.commandHandlers.has(commandId);
  }

  /** Get all registered command IDs. */
  getCommandIds(): string[] {
    return Array.from(this.commandHandlers.keys());
  }

  /**
   * Fire an activation event.
   * Activates all extensions that listen for this event.
   */
  fireActivationEvent(event: string): string[] {
    const toActivate = this.registry.findByActivationEvent(event);
    const activated: string[] = [];
    for (let i = 0; i < toActivate.length; i++) {
      if (this.activate(toActivate[i].manifest.id)) {
        activated.push(toActivate[i].manifest.id);
      }
    }
    return activated;
  }

  /** Build the API object that an extension receives on activation. */
  buildAPI(): ExtensionAPI {
    return {
      commands: {
        registerCommand: (id, handler) => this.registerCommand(id, handler),
        executeCommand: (id, ...args) => this.executeCommand(id, ...args),
      },
      workspace: {
        rootPath: this.workspaceRoot,
      },
    };
  }

  /** Get counts for dashboard display. */
  getStats(): { installed: number; active: number; inactive: number; errors: number } {
    return {
      installed: this.registry.count,
      active: this.registry.getByState('active').length,
      inactive: this.registry.getByState('inactive').length + this.registry.getByState('installed').length,
      errors: this.registry.getByState('error').length,
    };
  }
}
