/**
 * This is an internal part of the plugin infrastructure.
 *
 * @remarks
 * This object is the constructor parameter for API Documenter plugin features.
 *
 * @public
 */
export declare class PluginFeatureInitialization {
    /** @internal */
    _context: PluginFeatureContext;
    /** @internal */
    constructor();
}
/**
 * Context object for {@link PluginFeature}.
 * Exposes various services that can be used by a plugin.
 *
 * @public
 */
export declare class PluginFeatureContext {
}
/**
 * The abstract base class for all API Documenter plugin features.
 * @public
 */
export declare abstract class PluginFeature {
    /**
     * Exposes various services that can be used by a plugin.
     */
    context: PluginFeatureContext;
    /**
     * The subclass should pass the `initialization` through to the base class.
     * Do not put custom initialization code in the constructor.  Instead perform your initialization in the
     * `onInitialized()` event function.
     * @internal
     */
    constructor(initialization: PluginFeatureInitialization);
    /**
     * This event function is called after the feature is initialized, but before any processing occurs.
     * @virtual
     */
    onInitialized(): void;
}
//# sourceMappingURL=PluginFeature.d.ts.map