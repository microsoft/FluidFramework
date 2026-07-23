/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { UsageError } from "@fluidframework/telemetry-utils/internal";

import { getOrCreate } from "./util/index.js";

/**
 * Utilities for composing application "components" which contribute to a shared configuration.
 *
 * @remarks
 * Nothing in this namespace is specific to tree schema,
 * however it is designed to be able to handle the needs of components which work with {@link TreeSchema}.
 *
 * This is mainly used to implement "open polymorphism", where the set of allowed types
 * for a field or collection can be extended by independently authored libraries (components) instead of being
 * fixed up front.
 *
 * This basically amounts to dependency injection, where the "injection" is done at "composition" time to build the schema.
 *
 * Tree's schema do not natively support open polymorphism: all possible implementations must be explicitly listed.
 * These tools work around these limitations by carefully controlling evaluation order:
 * the source code can be structured in an open polymorphism style which at runtime evaluates into closed polymorphism
 * by having each component register its implementations into a central collection (typically an
 * {@link AllowedTypes} array).
 *
 * Each component is expressed as a {@link Component.Factory}: a function which receives a lazy reference to the
 * composed configuration and returns the content that component contributes.
 * Because the configuration is provided lazily, components may reference (including recursively) types contributed by
 * other components, as long as nothing evaluates the lazy references until composition has completed.
 * Use {@link Component.(compose:1)} to combine a set of components into a {@link Component.Composed}.
 *
 * See {@link https://github.com/microsoft/FluidFramework/blob/main/packages/dds/tree/src/test/openPolymorphism.integration.ts|openPolymorphism.integration.ts} for worked examples of this pattern.
 *
 * @privateRemarks
 * The examples and integration tests for this pattern live in `openPolymorphism.integration.ts`.
 * Those tests and the docs here should be kept in sync.
 *
 * @alpha
 */
export namespace Component {
	/**
	 * A function which takes in a lazy configuration and returns the content a component contributes.
	 *
	 * @remarks
	 * The lazy configuration allows the component to reference items from the composed configuration, which can
	 * include items the component itself contributes (allowing recursive references between components).
	 *
	 * The execution of the factory must not evaluate `lazyConfiguration` (doing so will error):
	 * instead the returned `TComponent` can capture `lazyConfiguration` and evaluate it at a later time
	 * (after all components have been composed).
	 *
	 * @typeParam TComponent - The content a component contributes.
	 * @typeParam TConfig - The composed configuration type made available to components.
	 * Defaults to the {@link Component.Composed} produced by composition: the common case where
	 * components read composed content directly from the composition and no custom configuration type is needed.
	 *
	 * @input
	 * @alpha
	 */
	export type Factory<TComponent, TConfig = ComposedDefault<TComponent>> = (
		lazyConfiguration: () => TConfig,
	) => TComponent;

	/**
	 * A function which returns an array of lazy values which each evaluate to `T`.
	 *
	 * @remarks
	 * This mirrors the shape of {@link AllowedTypes} where all of the values are lazy:
	 * the outer function and inner functions defer evaluation until after composition is complete.
	 *
	 * @typeParam T - The type each lazy value evaluates to.
	 *
	 * @alpha
	 */
	export type LazyArray<T> = () => readonly (() => T)[];

	/**
	 * Wrap a 0 argument function to cache the result.
	 * @remarks
	 * Do not use for impure functions.
	 *
	 * Generally {@link Component} utilities have built in caching in most cases,
	 * but this is occasionally helpful when manually implementing laziness.
	 *
	 * Note that this takes a different approach than use in {@link evaluateLazySchema} where the function evaluation is done using a utility that adds caching.
	 *
	 * @param factory - The factory function to memoize.
	 * @returns A function that returns the cached result of the factory.
	 * @alpha
	 */
	export const memoize = <T>(factory: () => T): (() => T) => {
		let run = false;
		let cached: T;
		return () => {
			if (!run) {
				cached = factory();
				run = true;
			}
			return cached;
		};
	};

	/**
	 * An item which can be configured (evaluated) against a composed configuration to produce a result.
	 *
	 * @remarks
	 * Use {@link Component.Composed.getConfigured} to evaluate a `Configurable`.
	 * The result is cached, so a given `Configurable` is only evaluated once per composition.
	 *
	 * @typeParam TConfigPartial - The configuration type made available when configuring.
	 * @typeParam TResult - The result produced by configuring.
	 * @typeParam TComponent - The content components contribute.
	 *
	 * @alpha
	 */
	export interface Configurable<TConfigPartial, out TResult, TComponent> {
		/**
		 * Produce the configured result.
		 * @param config - The composed configuration.
		 * @param components - The composed components.
		 */
		configure(
			config: TConfigPartial,
			components: Composed<TComponent, TConfigPartial>,
		): TResult;
	}

	/**
	 * Implementation of {@link Component.Composed}.
	 */
	class Config<TConfig, TComponent> implements Composed<TComponent, TConfig> {
		public readonly componentsMap: ReadonlyMap<Factory<TComponent, TConfig>, TComponent>;

		/**
		 * Cache of results produced by {@link Component.Composed.getConfigured}.
		 *
		 * @remarks
		 * Maps each {@link Component.Configurable} to the result of evaluating it against this composition.
		 * This ensures a given `Configurable` is only configured once: subsequent lookups return the cached result.
		 */
		private readonly evaluatedMap: Map<Configurable<TConfig, unknown, TComponent>, unknown> =
			new Map();

		/**
		 * Cache of results produced by {@link Component.Composed.getComposed}.
		 *
		 * @remarks
		 * Maps each composed property to the array produced for it.
		 * This ensures a given property is only composed once: subsequent lookups return the same array
		 * (including the same lazy values), so repeated calls with the same property are reference-stable.
		 */
		private readonly composedMap: Map<keyof TComponent, readonly unknown[]> = new Map();

		public readonly components: readonly TComponent[];

		public readonly config: TConfig;

		public constructor(
			allComponents: readonly Factory<TComponent, TConfig>[],
			lazyConfiguration: (composed: Composed<TComponent, TConfig>) => TConfig,
		) {
			// eslint-disable-next-line no-undef-init -- Explicitly undefined: `config` is populated below, after all components have been constructed, and is read lazily via `lazyConfigInner`.
			let config: TConfig | undefined = undefined;
			const lazyConfigInner = (): TConfig => {
				if (config === undefined) {
					throw new UsageError(
						"Configuration not yet available: components must not evaluate the lazy configuration during composition.",
					);
				}
				return config;
			};
			this.componentsMap = new Map(allComponents.map((c) => [c, c(lazyConfigInner)]));
			this.components = [...this.componentsMap.values()];
			config = lazyConfiguration(this);
			this.config = config;
		}

		public getComponent<TFactory extends Factory<TComponent, TConfig>>(
			factory: TFactory,
		): ReturnType<TFactory> {
			const found = this.componentsMap.get(factory);
			if (found === undefined) {
				throw new UsageError("Requested component not included in this configuration");
			}
			return found as ReturnType<TFactory>;
		}

		public getConfigured<TConfigurable extends Configurable<TConfig, unknown, TComponent>>(
			configurable: TConfigurable,
		): ReturnType<TConfigurable["configure"]> {
			const configured: unknown = getOrCreate(this.evaluatedMap, configurable, (c) => {
				const result = c.configure(this.config, this);
				if (result === undefined) {
					throw new UsageError("Configurable must not return undefined");
				}
				return result;
			});
			return configured as ReturnType<TConfigurable["configure"]>;
		}

		public getComposed<
			TKey extends keyof {
				[Property in keyof TComponent as TComponent[Property] extends
					| LazyArray<unknown>
					| undefined
					? Property
					: never]: boolean;
			},
		>(
			property: TKey,
		): readonly (Exclude<TComponent[TKey], undefined> extends LazyArray<infer U>
			? () => U
			: never)[] {
			const result = getOrCreate(this.composedMap, property, () =>
				this.components.flatMap((c) => {
					const prop = c[property] as LazyArray<unknown> | undefined;
					if (prop === undefined) {
						return [];
					}
					return prop();
				}),
			);
			return result as (Exclude<TComponent[TKey], undefined> extends LazyArray<infer U>
				? () => U
				: never)[];
		}
	}

	/**
	 * Combine multiple {@link Component.Factory|components} into a single {@link Component.Composed}.
	 *
	 * @remarks
	 * The {@link Component.Composed} itself is used as the configuration made available to components:
	 * the simple case where components read composed content directly from the composition.
	 * To produce a custom aggregated configuration, use the overload which takes a `lazyConfiguration` builder.
	 *
	 * @param allComponents - The components to compose.
	 * @returns The composed components, from which configuration and per-component content can be read.
	 *
	 * @typeParam TComponent - The content each component contributes.
	 *
	 * @alpha
	 */
	export function compose<TComponent>(
		allComponents: readonly Factory<TComponent>[],
	): Composed<TComponent>;
	/**
	 * Combine multiple {@link Component.Factory|components} into a single {@link Component.Composed}.
	 *
	 * @param allComponents - The components to compose.
	 * @param lazyConfiguration - Builds the composed configuration from the composed components.
	 * This is invoked once, after all components have been created, and can aggregate content contributed by the
	 * components (for example via {@link Component.Composed.getComposed}).
	 * @returns The composed components, from which configuration and per-component content can be read.
	 *
	 * @typeParam TComponent - The content each component contributes.
	 * @typeParam TConfig - The composed configuration type made available to components.
	 *
	 * @alpha
	 */
	export function compose<TComponent, TConfig>(
		allComponents: readonly Factory<TComponent, TConfig>[],
		lazyConfiguration: (composed: Composed<TComponent, TConfig>) => TConfig,
	): Composed<TComponent, TConfig>;
	export function compose<TComponent, TConfig>(
		allComponents: readonly Factory<TComponent, TConfig>[],
		lazyConfiguration: (composed: Composed<TComponent, TConfig>) => TConfig = (composed) =>
			composed as unknown as TConfig,
	): Composed<TComponent, TConfig> {
		return new Config<TConfig, TComponent>(allComponents, lazyConfiguration);
	}

	/**
	 * The default configuration type for a composition.
	 * Also the type of Composed when using the default composition.
	 * @privateRemarks
	 * Declaring this as its own type makes the recursion possible instead of having to list the config parameter as unknown.
	 * This makes it easier to understand what is going on when seeing this type in the intellisense.
	 * @sealed @alpha
	 */
	export type ComposedDefault<TComponent> = Composed<TComponent, ComposedDefault<TComponent>>;

	/**
	 * The result of composing multiple components.
	 *
	 * @remarks
	 * Create using {@link Component.(compose:1)}.
	 *
	 * @typeParam TComponent - The content each component contributes.
	 * @typeParam TConfig - The composed configuration type made available to components.
	 * Defaults to the composition itself: the common case where no custom configuration type is needed.
	 *
	 * @sealed @alpha
	 */
	export interface Composed<TComponent, TConfig = ComposedDefault<TComponent>> {
		/**
		 * The components which were composed.
		 */
		readonly components: readonly TComponent[];

		/**
		 * The configuration which was produced when composing.
		 */
		readonly config: TConfig;

		/**
		 * Get a component by its factory.
		 *
		 * @param factory - The factory used to look up the component. Must have been provided when composing.
		 * @returns The content created by the provided factory.
		 * This result is cached during composition and not reevaluated.
		 */
		getComponent<TFactory extends Factory<TComponent, TConfig>>(
			factory: TFactory,
		): ReturnType<TFactory>;

		/**
		 * Configure a {@link Component.Configurable}.
		 * @remarks
		 * The result is cached when first evaluated, so subsequent calls with the same `configurable` return the
		 * same result.
		 * @param configurable - The item to configure against this composition.
		 */
		getConfigured<TConfigurable extends Configurable<TConfig, unknown, TComponent>>(
			configurable: TConfigurable,
		): ReturnType<TConfigurable["configure"]>;

		/**
		 * Compose the contents of a {@link Component.LazyArray} property from all components.
		 * @remarks
		 * The result is cached when first evaluated, so subsequent calls with the same `property` return the
		 * same result.
		 * @param property - The property of the components to compose.
		 * @returns The concatenation of the lazy values contributed by each component for `property`.
		 * Components which omit the property contribute nothing.
		 */
		getComposed<
			TKey extends keyof {
				[Property in keyof TComponent as TComponent[Property] extends
					| LazyArray<unknown>
					| undefined
					? Property
					: never]: boolean;
			},
		>(
			property: TKey,
		): readonly (Exclude<TComponent[TKey], undefined> extends LazyArray<infer U>
			? () => U
			: never)[];
	}
}
