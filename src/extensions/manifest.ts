/**
 * Extension manifest parsing — hone-extension.json schema.
 *
 * Built-in language support configuration — separate from the v2 plugin
 * system (hone-extension/). This module handles manifests for the 11 built-in
 * language bundles in hone-extensions/ (TypeScript, Python, Rust, etc.).
 */

export interface ExtensionManifest {
  /** Unique extension identifier (publisher.name) */
  id: string;
  /** Display name */
  name: string;
  /** Version string (semver) */
  version: string;
  /** Description */
  description: string;
  /** Publisher name */
  publisher: string;
  /** Extension entry point (relative to extension root) */
  main: string;
  /** Activation events */
  activationEvents: string[];
  /** Contributions (commands, menus, settings, etc.) */
  contributes: ExtensionContributions;
  /** Required engine version */
  engines: { hone: string };
  /** Categories for marketplace browsing */
  categories: string[];
  /** Icon path (relative) */
  icon?: string;
  /** Repository URL */
  repository?: string;
}

export interface ExtensionContributions {
  commands?: ContributedCommand[];
  menus?: Record<string, ContributedMenuItem[]>;
  configuration?: ContributedConfiguration[];
  languages?: ContributedLanguage[];
  keybindings?: ContributedKeybinding[];
}

export interface ContributedCommand {
  command: string;
  title: string;
  category?: string;
  icon?: string;
}

export interface ContributedMenuItem {
  command: string;
  when?: string;
  group?: string;
}

export interface ContributedConfiguration {
  title: string;
  properties: Record<string, {
    type: string;
    default?: unknown;
    description?: string;
    enum?: string[];
  }>;
}

export interface ContributedLanguage {
  id: string;
  extensions: string[];
  aliases?: string[];
}

export interface ContributedKeybinding {
  command: string;
  key: string;
  when?: string;
  mac?: string;
}

export interface ManifestValidationError {
  field: string;
  message: string;
}

/**
 * Parse and validate an extension manifest from JSON.
 */
export function parseManifest(json: string): { manifest: ExtensionManifest | null; errors: ManifestValidationError[] } {
  const errors: ManifestValidationError[] = [];

  let data: Record<string, unknown>;
  try {
    data = JSON.parse(json);
  } catch {
    return { manifest: null, errors: [{ field: 'root', message: 'Invalid JSON' }] };
  }

  // Required fields
  if (typeof data.id !== 'string' || data.id.length === 0) {
    errors.push({ field: 'id', message: 'id is required and must be a non-empty string' });
  }
  if (typeof data.name !== 'string' || data.name.length === 0) {
    errors.push({ field: 'name', message: 'name is required and must be a non-empty string' });
  }
  if (typeof data.version !== 'string' || data.version.length === 0) {
    errors.push({ field: 'version', message: 'version is required and must be a non-empty string' });
  }
  if (typeof data.main !== 'string' || data.main.length === 0) {
    errors.push({ field: 'main', message: 'main is required and must be a non-empty string' });
  }

  if (errors.length > 0) {
    return { manifest: null, errors };
  }

  const manifest: ExtensionManifest = {
    id: data.id as string,
    name: data.name as string,
    version: data.version as string,
    description: (data.description as string) ?? '',
    publisher: (data.publisher as string) ?? '',
    main: data.main as string,
    activationEvents: Array.isArray(data.activationEvents) ? data.activationEvents : [],
    contributes: parseContributions(data.contributes as Record<string, unknown> | undefined),
    engines: { hone: ((data.engines as Record<string, string>)?.hone) ?? '*' },
    categories: Array.isArray(data.categories) ? data.categories : [],
    icon: data.icon as string | undefined,
    repository: data.repository as string | undefined,
  };

  return { manifest, errors };
}

function parseContributions(data: Record<string, unknown> | undefined): ExtensionContributions {
  if (!data) return {};

  const result: ExtensionContributions = {};

  if (Array.isArray(data.commands)) {
    result.commands = data.commands as ContributedCommand[];
  }

  if (data.menus && typeof data.menus === 'object') {
    result.menus = data.menus as Record<string, ContributedMenuItem[]>;
  }

  if (Array.isArray(data.configuration)) {
    result.configuration = data.configuration as ContributedConfiguration[];
  }

  if (Array.isArray(data.languages)) {
    result.languages = data.languages as ContributedLanguage[];
  }

  if (Array.isArray(data.keybindings)) {
    result.keybindings = data.keybindings as ContributedKeybinding[];
  }

  return result;
}
