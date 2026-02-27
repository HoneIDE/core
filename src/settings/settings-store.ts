/**
 * Settings store — layered settings resolution.
 *
 * Priority (highest wins):
 *   language overrides > workspace overrides > user settings > defaults
 *
 * API mirrors VS Code's workspace configuration API so the extension system
 * can provide a compatible surface.
 */

import { BUILTIN_SCHEMA, buildSchemaRegistry, validateSetting, type SchemaRegistry, type ValidationResult } from './schema';

export type SettingsLayer = 'default' | 'user' | 'workspace' | 'language';

export type SettingsChangeEvent = {
  keys: string[];
  layer: SettingsLayer;
};

export type SettingsChangeListener = (event: SettingsChangeEvent) => void;

// ---------------------------------------------------------------------------
// SettingsStore
// ---------------------------------------------------------------------------

export class SettingsStore {
  private defaults: Map<string, unknown>;
  private user: Map<string, unknown>;
  private workspace: Map<string, unknown>;
  private language: Map<string, unknown>;
  private schema: SchemaRegistry;
  private listeners: SettingsChangeListener[] = [];

  constructor(extraSchema?: Record<string, import('./schema').SettingSchema>) {
    this.schema = buildSchemaRegistry(extraSchema);
    this.defaults = new Map();
    this.user = new Map();
    this.workspace = new Map();
    this.language = new Map();

    // Populate defaults from schema
    for (const [key, def] of this.schema.entries()) {
      this.defaults.set(key, def.default);
    }
  }

  // ---------------------------------------------------------------------------
  // Read
  // ---------------------------------------------------------------------------

  /** Get a setting value, resolving through all layers. */
  get<T = unknown>(key: string): T {
    if (this.language.has(key)) return this.language.get(key) as T;
    if (this.workspace.has(key)) return this.workspace.get(key) as T;
    if (this.user.has(key)) return this.user.get(key) as T;
    if (this.defaults.has(key)) return this.defaults.get(key) as T;
    return undefined as T;
  }

  /** Get the value from a specific layer (or undefined if not set in that layer). */
  getFromLayer<T = unknown>(key: string, layer: SettingsLayer): T | undefined {
    const map = this.layerMap(layer);
    return map.has(key) ? (map.get(key) as T) : undefined;
  }

  /** Check if a setting is explicitly set in any user-facing layer (not just default). */
  isOverridden(key: string): boolean {
    return this.language.has(key) || this.workspace.has(key) || this.user.has(key);
  }

  /** Get the effective layer that supplies the value for a key. */
  effectiveLayer(key: string): SettingsLayer {
    if (this.language.has(key)) return 'language';
    if (this.workspace.has(key)) return 'workspace';
    if (this.user.has(key)) return 'user';
    return 'default';
  }

  /** Get all keys that are defined in the schema. */
  keys(): string[] {
    return Array.from(this.schema.keys());
  }

  // ---------------------------------------------------------------------------
  // Write
  // ---------------------------------------------------------------------------

  /** Set a value in a specific layer. Validates against schema if schema entry exists. */
  set(key: string, value: unknown, layer: SettingsLayer = 'user'): ValidationResult {
    if (layer === 'default') {
      return { valid: false, errors: ['Cannot write to the default layer'] };
    }

    const result = validateSetting(key, value, this.schema);
    if (!result.valid) return result;

    const map = this.layerMap(layer);
    map.set(key, value);
    this.notify([key], layer);
    return { valid: true, errors: [] };
  }

  /** Remove an override from a layer (falls back to next layer). */
  unset(key: string, layer: SettingsLayer = 'user'): void {
    if (layer === 'default') return;
    const map = this.layerMap(layer);
    if (map.has(key)) {
      map.delete(key);
      this.notify([key], layer);
    }
  }

  /** Bulk-load settings into a layer from a parsed JSON object. */
  loadLayer(layer: SettingsLayer, data: Record<string, unknown>): ValidationResult[] {
    if (layer === 'default') return [];
    const results: ValidationResult[] = [];
    const changedKeys: string[] = [];
    const map = this.layerMap(layer);

    for (const [key, value] of Object.entries(data)) {
      const result = validateSetting(key, value, this.schema);
      results.push(result);
      if (result.valid) {
        map.set(key, value);
        changedKeys.push(key);
      }
    }

    if (changedKeys.length > 0) {
      this.notify(changedKeys, layer);
    }

    return results;
  }

  /** Clear all overrides from a layer. */
  clearLayer(layer: SettingsLayer): void {
    if (layer === 'default') return;
    const map = this.layerMap(layer);
    const keys = Array.from(map.keys());
    map.clear();
    if (keys.length > 0) {
      this.notify(keys, layer);
    }
  }

  // ---------------------------------------------------------------------------
  // Serialization
  // ---------------------------------------------------------------------------

  /** Export a layer as a plain object (for persistence). */
  exportLayer(layer: SettingsLayer): Record<string, unknown> {
    const map = this.layerMap(layer);
    const result: Record<string, unknown> = {};
    for (const [key, value] of map.entries()) {
      result[key] = value;
    }
    return result;
  }

  // ---------------------------------------------------------------------------
  // Events
  // ---------------------------------------------------------------------------

  /** Register a listener for settings changes. Returns unsubscribe function. */
  onChange(listener: SettingsChangeListener): () => void {
    this.listeners.push(listener);
    return () => {
      const idx = this.listeners.indexOf(listener);
      if (idx >= 0) this.listeners.splice(idx, 1);
    };
  }

  // ---------------------------------------------------------------------------
  // Schema
  // ---------------------------------------------------------------------------

  /** Register additional settings from an extension. */
  registerSchema(key: string, schema: import('./schema').SettingSchema): void {
    this.schema.set(key, schema);
    if (!this.defaults.has(key)) {
      this.defaults.set(key, schema.default);
    }
  }

  /** Get the schema for a specific key. */
  getSchema(key: string): import('./schema').SettingSchema | undefined {
    return this.schema.get(key);
  }

  // ---------------------------------------------------------------------------
  // Private
  // ---------------------------------------------------------------------------

  private layerMap(layer: SettingsLayer): Map<string, unknown> {
    switch (layer) {
      case 'default': return this.defaults;
      case 'user': return this.user;
      case 'workspace': return this.workspace;
      case 'language': return this.language;
    }
  }

  private notify(keys: string[], layer: SettingsLayer): void {
    const event: SettingsChangeEvent = { keys, layer };
    for (const listener of this.listeners) {
      listener(event);
    }
  }
}

// ---------------------------------------------------------------------------
// Global instance
// ---------------------------------------------------------------------------

let _globalStore: SettingsStore | null = null;

/** Get (or create) the global settings store. */
export function getSettingsStore(): SettingsStore {
  if (!_globalStore) {
    _globalStore = new SettingsStore();
  }
  return _globalStore;
}

/** Reset the global store (for testing). */
export function resetSettingsStore(): void {
  _globalStore = new SettingsStore();
}
