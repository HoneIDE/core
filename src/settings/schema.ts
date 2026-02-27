/**
 * Settings schema — type definitions, validation, and the default schema.
 *
 * Schema structure matches VS Code's settings JSON schema pattern.
 * Each setting has a type, default, description, and optional enum values.
 */

export type SettingType = 'string' | 'number' | 'boolean' | 'array' | 'object';

export interface SettingSchema {
  type: SettingType;
  default: unknown;
  description: string;
  enum?: unknown[];
  enumDescriptions?: string[];
  minimum?: number;
  maximum?: number;
  items?: { type: SettingType };
}

export type SchemaRegistry = Map<string, SettingSchema>;

// ---------------------------------------------------------------------------
// Built-in schema
// ---------------------------------------------------------------------------

/** All built-in Hone settings with their types and defaults. */
export const BUILTIN_SCHEMA: Record<string, SettingSchema> = {
  // Editor
  'editor.fontSize': {
    type: 'number',
    default: 13,
    description: 'Font size in pixels for the editor.',
    minimum: 6,
    maximum: 72,
  },
  'editor.fontFamily': {
    type: 'string',
    default: 'Menlo, Monaco, "Courier New", monospace',
    description: 'Font family for the editor.',
  },
  'editor.tabSize': {
    type: 'number',
    default: 2,
    description: 'Number of spaces a tab is equal to.',
    minimum: 1,
    maximum: 16,
  },
  'editor.insertSpaces': {
    type: 'boolean',
    default: true,
    description: 'Insert spaces when pressing Tab.',
  },
  'editor.wordWrap': {
    type: 'string',
    default: 'off',
    description: 'Controls how lines should wrap.',
    enum: ['off', 'on', 'wordWrapColumn', 'bounded'],
    enumDescriptions: [
      'Lines will never wrap.',
      'Lines will wrap at the viewport width.',
      'Lines will wrap at editor.wordWrapColumn.',
      'Lines will wrap at minimum of viewport width and editor.wordWrapColumn.',
    ],
  },
  'editor.lineNumbers': {
    type: 'string',
    default: 'on',
    description: 'Controls the display of line numbers.',
    enum: ['off', 'on', 'relative', 'interval'],
  },
  'editor.minimap.enabled': {
    type: 'boolean',
    default: true,
    description: 'Controls whether the minimap is shown.',
  },
  'editor.formatOnSave': {
    type: 'boolean',
    default: false,
    description: 'Format a file on save.',
  },
  'editor.cursorStyle': {
    type: 'string',
    default: 'line',
    description: 'Controls the cursor style.',
    enum: ['line', 'block', 'underline', 'line-thin', 'block-outline', 'underline-thin'],
  },

  // Workbench layout
  'workbench.sideBar.location': {
    type: 'string',
    default: 'left',
    description: 'Controls the location of the sidebar (Explorer, Search, etc.).',
    enum: ['left', 'right'],
    enumDescriptions: ['Show the sidebar on the left side.', 'Show the sidebar on the right side.'],
  },
  'workbench.activityBar.location': {
    type: 'string',
    default: 'side',
    description: 'Controls the location of the Activity Bar.',
    enum: ['side', 'top', 'bottom', 'hidden'],
  },
  'workbench.panel.defaultLocation': {
    type: 'string',
    default: 'bottom',
    description: 'Controls the default location of the panel.',
    enum: ['bottom', 'right', 'left'],
  },
  'workbench.colorTheme': {
    type: 'string',
    default: 'Hone Dark',
    description: 'Specifies the color theme used in the workbench.',
  },
  'workbench.statusBar.visible': {
    type: 'boolean',
    default: true,
    description: 'Controls the visibility of the status bar.',
  },

  // Files
  'files.autoSave': {
    type: 'string',
    default: 'off',
    description: 'Controls auto save of editors.',
    enum: ['off', 'afterDelay', 'onFocusChange', 'onWindowChange'],
  },
  'files.autoSaveDelay': {
    type: 'number',
    default: 1000,
    description: 'Controls the delay in ms after which an editor is auto saved (when autoSave is set to afterDelay).',
    minimum: 0,
  },
  'files.exclude': {
    type: 'object',
    default: { '**/.git': true, '**/node_modules': true, '**/.DS_Store': true },
    description: 'Configure glob patterns for excluding files and folders.',
  },
  'files.trimTrailingWhitespace': {
    type: 'boolean',
    default: false,
    description: 'When enabled, will trim trailing whitespace when saving a file.',
  },

  // Terminal
  'terminal.integrated.fontSize': {
    type: 'number',
    default: 13,
    description: 'Controls the font size in pixels of the terminal.',
    minimum: 6,
    maximum: 72,
  },
  'terminal.integrated.cursorStyle': {
    type: 'string',
    default: 'block',
    description: 'Controls the style of terminal cursor.',
    enum: ['block', 'underline', 'line'],
  },

  // AI
  'ai.provider': {
    type: 'string',
    default: 'anthropic',
    description: 'Default AI provider for inline completion and chat.',
    enum: ['anthropic', 'openai', 'google', 'ollama', 'openai-compat', 'bedrock', 'vertex', 'azure-openai'],
  },
  'ai.inlineCompletion.enabled': {
    type: 'boolean',
    default: true,
    description: 'Enable AI inline code completion (ghost text).',
  },
  'ai.inlineCompletion.delay': {
    type: 'number',
    default: 300,
    description: 'Delay in ms before requesting an inline completion.',
    minimum: 0,
    maximum: 5000,
  },
  'ai.chat.model': {
    type: 'string',
    default: 'claude-sonnet-4-6',
    description: 'Model to use for AI chat.',
  },

  // Search
  'search.useIgnoreFiles': {
    type: 'boolean',
    default: true,
    description: 'Controls whether to use .gitignore and .ignore files when searching.',
  },
  'search.followSymlinks': {
    type: 'boolean',
    default: true,
    description: 'Controls whether to follow symlinks when searching.',
  },
};

// ---------------------------------------------------------------------------
// Validation
// ---------------------------------------------------------------------------

export interface ValidationResult {
  valid: boolean;
  errors: string[];
}

/** Validate a single setting value against its schema. */
export function validateSetting(key: string, value: unknown, schema: SchemaRegistry): ValidationResult {
  const def = schema.get(key);
  if (!def) {
    return { valid: false, errors: [`Unknown setting: ${key}`] };
  }

  const errors: string[] = [];

  if (typeof value !== def.type && !(def.type === 'array' && Array.isArray(value)) &&
      !(def.type === 'object' && typeof value === 'object' && value !== null && !Array.isArray(value))) {
    errors.push(`${key}: expected ${def.type}, got ${Array.isArray(value) ? 'array' : typeof value}`);
  }

  if (def.enum && !def.enum.includes(value)) {
    errors.push(`${key}: "${value}" is not one of [${def.enum.map(e => JSON.stringify(e)).join(', ')}]`);
  }

  if (def.type === 'number' && typeof value === 'number') {
    if (def.minimum !== undefined && value < def.minimum) {
      errors.push(`${key}: ${value} is less than minimum ${def.minimum}`);
    }
    if (def.maximum !== undefined && value > def.maximum) {
      errors.push(`${key}: ${value} is greater than maximum ${def.maximum}`);
    }
  }

  return { valid: errors.length === 0, errors };
}

/** Build a SchemaRegistry from the builtin schema and any extensions. */
export function buildSchemaRegistry(extra?: Record<string, SettingSchema>): SchemaRegistry {
  const registry: SchemaRegistry = new Map();
  for (const [key, schema] of Object.entries(BUILTIN_SCHEMA)) {
    registry.set(key, schema);
  }
  if (extra) {
    for (const [key, schema] of Object.entries(extra)) {
      registry.set(key, schema);
    }
  }
  return registry;
}
