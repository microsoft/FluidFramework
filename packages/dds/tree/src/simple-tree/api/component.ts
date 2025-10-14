/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

/**
 * Utilities for helping implement various application component design patterns.
 * @alpha
 */
export namespace Component {
	/**
	 * Function which takes in a lazy configuration and returns a collection of schema types.
	 * @remarks
	 * This allows the schema to reference items from the configuration, which could include themselves recursively.
	 * @alpha
	 */
	export type ComponentSchemaCollection<TConfig, TSchema> = (
		lazyConfiguration: () => TConfig,
	) => LazyArray<TSchema>;

	/**
	 * {@link AllowedTypes} where all of the allowed types' schema implement `T` and are lazy.
	 * @alpha
	 */
	export type LazyArray<T> = readonly (() => T)[];

	/**
	 * Combine multiple {@link Component.ComponentSchemaCollection}s into a single {@link AllowedTypes} array.
	 * @remarks
	 *
	 * @alpha
	 */
	export function composeComponentSchema<TConfig, TItem>(
		allComponents: readonly ComponentSchemaCollection<TConfig, TItem>[],
		lazyConfiguration: () => TConfig,
	): (() => TItem)[] {
		const itemTypes = allComponents.flatMap(
			(component): LazyArray<TItem> => component(lazyConfiguration),
		);
		return itemTypes;
	}
}
