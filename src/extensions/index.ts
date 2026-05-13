/**
 * Built-in language support configuration — separate from the v2 plugin
 * system (hone-extension/). Re-exports for the 11 built-in language bundles.
 */

export { parseManifest } from './manifest';
export type {
  ExtensionManifest, ExtensionContributions,
  ContributedCommand, ContributedMenuItem,
  ContributedConfiguration, ContributedLanguage,
  ContributedKeybinding, ManifestValidationError,
} from './manifest';

export { ExtensionRegistry } from './registry';
export type { RegisteredExtension, ExtensionState } from './registry';

export { ExtensionHost } from './extension-host';
export type { ExtensionAPI, ExtensionActivation } from './extension-host';

export { createCommandRegistry, createStatusBarItem, createDiagnosticCollection, createOutputChannel } from './extension-api-impl';
export type { CommandRegistry, StatusBarItem, DiagnosticCollection, OutputChannel } from './extension-api-impl';
