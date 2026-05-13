/**
 * Provider registry — manages AI provider adapters.
 */
import type { AIProviderAdapter, AIProviderConfig } from './ai-protocol';

export interface RegisteredProvider {
  adapter: AIProviderAdapter;
  config: AIProviderConfig;
  enabled: boolean;
}

export class ProviderRegistry {
  private providers = new Map<string, RegisteredProvider>();

  /** Register a provider adapter with its config. */
  register(adapter: AIProviderAdapter, config: AIProviderConfig): void {
    this.providers.set(adapter.id, {
      adapter,
      config,
      enabled: true,
    });
  }

  /** Unregister a provider. */
  unregister(id: string): void {
    this.providers.delete(id);
  }

  /** Get a provider by ID. */
  get(id: string): RegisteredProvider | undefined {
    return this.providers.get(id);
  }

  /** Get all registered providers. */
  getAll(): RegisteredProvider[] {
    return Array.from(this.providers.values());
  }

  /** Get all enabled providers. */
  getEnabled(): RegisteredProvider[] {
    return Array.from(this.providers.values()).filter(p => p.enabled);
  }

  /** Enable/disable a provider. */
  setEnabled(id: string, enabled: boolean): void {
    const p = this.providers.get(id);
    if (p) p.enabled = enabled;
  }

  /** Update a provider's config. */
  updateConfig(id: string, config: Partial<AIProviderConfig>): void {
    const p = this.providers.get(id);
    if (p) {
      p.config = { ...p.config, ...config };
    }
  }

  /** Check if a provider is registered. */
  has(id: string): boolean {
    return this.providers.has(id);
  }

  /** Get count of registered providers. */
  count(): number {
    return this.providers.size;
  }
}
