/**
 * Model router — routes AI features to specific providers/models.
 */

export type AIFeature =
  | 'chat'
  | 'inline_completion'
  | 'code_action'
  | 'commit_message'
  | 'pr_review'
  | 'agent';

export interface ModelRoute {
  providerId: string;
  modelId: string;
}

export class ModelRouter {
  private routes = new Map<AIFeature, ModelRoute>();
  private defaultRoute: ModelRoute | null = null;

  /** Set the default route for all unspecified features. */
  setDefault(providerId: string, modelId: string): void {
    this.defaultRoute = { providerId, modelId };
  }

  /** Set a route for a specific feature. */
  setRoute(feature: AIFeature, providerId: string, modelId: string): void {
    this.routes.set(feature, { providerId, modelId });
  }

  /** Get the route for a feature (falls back to default). */
  getRoute(feature: AIFeature): ModelRoute | null {
    return this.routes.get(feature) ?? this.defaultRoute;
  }

  /** Remove a feature-specific route. */
  removeRoute(feature: AIFeature): void {
    this.routes.delete(feature);
  }

  /** Get all configured routes. */
  getAllRoutes(): Map<AIFeature, ModelRoute> {
    return new Map(this.routes);
  }

  /** Get the default route. */
  getDefault(): ModelRoute | null {
    return this.defaultRoute;
  }
}
