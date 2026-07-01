/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { UsageError } from "@fluidframework/telemetry-utils/internal";

import { getOrCreate } from "../../util/index.js";

/**
 * Utilities for composing application "components" which contribute to a shared configuration.
 *
 * @remarks
 * This namespace helps implement "open polymorphism" design patterns for schema, where the set of allowed types
 * for a field or collection can be extended by independently authored libraries (components) instead of being
 * fixed up front.
 *
 * Tree's stored schema do not support open polymorphism: all possible implementations must be explicitly listed.
 * View schema can however emulate it by carefully controlling evaluation order:
 * the source code can be structured in an open polymorphism style which at runtime evaluates into closed polymorphism
 * by having each component register its implementations into a central collection (typically used as
 * {@link AllowedTypes}).
 *
 * Each component is expressed as a {@link Component.Factory}: a function which receives a lazy reference to the
 * composed configuration and returns the content that component contributes.
 * Because the configuration is provided lazily, components may reference (including recursively) types contributed by
 * other components, as long as nothing evaluates the lazy references until composition has completed.
 * Use {@link Component.composeComponents} to combine a set of components into a {@link Component.ComposedComponents}.
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
	 * @typeParam TConfig - The composed configuration type made available to components.
	 * @typeParam TComponent - The content a component contributes.
	 *
	 * @input
	 * @alpha
	 */
	export type Factory<TConfig, TComponent> = (lazyConfiguration: () => TConfig) => TComponent;

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
	 * An item which can be configured (evaluated) against a composed configuration to produce a result.
	 *
	 * @remarks
	 * Use {@link Component.ComposedComponents.getConfigured} to evaluate a `Configurable`.
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
			components: ComposedComponents<TConfigPartial, TComponent>,
		): TResult;
	}

	/**
	 * Implementation of {@link Component.ComposedComponents}.
	 * @remarks
	 * Not exported: instances are created via {@link Component.composeComponents}.
	 */
	class Config<TConfig, TComponent> implements ComposedComponents<TConfig, TComponent> {
		public readonly componentsMap: ReadonlyMap<Factory<TConfig, TComponent>, TComponent>;

		public readonly evaluatedMap: Map<Configurable<TConfig, unknown, TComponent>, unknown> =
			new Map();

		public readonly components: readonly TComponent[];

		/**
		 * Portion of the config computed first.
		 */
		public readonly config: TConfig;

		public constructor(
			allComponents: readonly Factory<TConfig, TComponent>[],
			lazyConfiguration: (composed: ComposedComponents<TConfig, TComponent>) => TConfig,
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

		public getComponent<TFactory extends Factory<TConfig, TComponent>>(
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
			const found: unknown = getOrCreate(this.evaluatedMap, configurable, (c) =>
				c.configure(this.config, this),
			);
			return found as ReturnType<TConfigurable["configure"]>;
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
		): readonly (TComponent[TKey] extends LazyArray<infer U> ? () => U : never)[] {
			const result = this.components.flatMap((c) => {
				const prop = c[property] as LazyArray<unknown> | undefined;
				if (prop === undefined) {
					return [];
				}
				return prop();
			});
			return result as (TComponent[TKey] extends LazyArray<infer U> ? () => U : never)[];
		}
	}

	/**
	 * Combine multiple {@link Component.Factory|components} into a single {@link Component.ComposedComponents}.
	 *
	 * @param allComponents - The components to compose.
	 * @param lazyConfiguration - Builds the composed configuration from the composed components.
	 * This is invoked once, after all components have been created, and can aggregate content contributed by the
	 * components (for example via {@link Component.ComposedComponents.getComposed}).
	 * @returns The composed components, from which configuration and per-component content can be read.
	 *
	 * @typeParam TConfig - The composed configuration type made available to components.
	 * @typeParam TComponent - The content each component contributes.
	 *
	 * @alpha
	 */
	export function composeComponents<TConfig, TComponent>(
		allComponents: readonly Factory<TConfig, TComponent>[],
		lazyConfiguration: (composed: ComposedComponents<TConfig, TComponent>) => TConfig,
	): ComposedComponents<TConfig, TComponent> {
		return new Config<TConfig, TComponent>(allComponents, lazyConfiguration);
	}

	/**
	 * The result of composing multiple components.
	 *
	 * @remarks
	 * Create using {@link Component.composeComponents}.
	 *
	 * @typeParam TConfig - The composed configuration type made available to components.
	 * @typeParam TComponent - The content each component contributes.
	 *
	 * @sealed @alpha
	 */
	export interface ComposedComponents<TConfig, TComponent> {
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
		getComponent<TFactory extends Factory<TConfig, TComponent>>(
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
		): readonly (TComponent[TKey] extends LazyArray<infer U> ? () => U : never)[];
	}
}
