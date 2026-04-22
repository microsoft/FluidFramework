/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import type { RestrictiveStringRecord } from "../../util/index.js";
import type { ImplicitFieldSchema } from "../fieldSchema.js";

import type { ObjectSchemaOptionsAlpha } from "./schemaFactory.js";

/**
 * Settings for a {@link SchemaFactoryAlpha} instance.
 *
 * @remarks
 * Pass this to the second argument of the {@link SchemaFactoryAlpha} constructor to apply
 * factory-wide defaults to schema creation methods.
 *
 * Use {@link composeSchemaFactoryAlphaOptions} to combine two sets of options without
 * discarding existing settings.
 *
 * @alpha
 */
export interface SchemaFactoryAlphaOptions {
	/**
	 * A function called for each object schema created via {@link SchemaFactoryAlpha.objectAlpha}
	 * (and methods that delegate to it: `objectRecursive`, `objectRecursiveAlpha`).
	 *
	 * @remarks
	 * Receives the schema name, fields, and the per-call options (if any), and returns
	 * the options that will actually be used. Return `undefined` to use the per-call
	 * options unchanged.
	 *
	 * Typical use: supply factory-wide defaults such as `allowUnknownOptionalFields: true`
	 * without repeating them on every `objectAlpha` call.
	 *
	 * To layer this on top of an existing factory's settings without losing them,
	 * use {@link composeSchemaFactoryAlphaOptions}.
	 *
	 * @example
	 * ```typescript
	 * const sf = new SchemaFactoryAlpha("com.example", {
	 *     objectOptionDefaults: (_name, _fields, options) => ({
	 *         allowUnknownOptionalFields: true,
	 *         ...options, // per-call options take precedence
	 *     }),
	 * });
	 * ```
	 */
	readonly objectOptionDefaults?: <TCustomMetadata = unknown>(
		name: number | string,
		fields: RestrictiveStringRecord<ImplicitFieldSchema>,
		options: ObjectSchemaOptionsAlpha<TCustomMetadata> | undefined,
	) => ObjectSchemaOptionsAlpha<TCustomMetadata> | undefined;
}

/**
 * Composes two {@link SchemaFactoryAlphaOptions} into one, chaining their callbacks.
 *
 * @remarks
 * For `objectOptionDefaults`, `base` is called first; its result is then passed as the
 * `options` argument to `override`. This lets each layer build on the previous one
 * without losing any existing settings.
 *
 * Useful with {@link SchemaFactoryAlpha.withOptionsAlpha} when you want to extend a
 * factory's defaults without discarding them.
 *
 * @example
 * ```typescript
 * const extended = sf.withOptionsAlpha(
 *     composeSchemaFactoryAlphaOptions(sf.settings, {
 *         objectOptionDefaults: (_name, _fields, options) => ({
 *             allowUnknownOptionalFields: true,
 *             ...options,
 *         }),
 *     }),
 * );
 * ```
 *
 * @alpha
 */
export function composeSchemaFactoryAlphaOptions(
	base: SchemaFactoryAlphaOptions,
	override: SchemaFactoryAlphaOptions,
): SchemaFactoryAlphaOptions {
	return {
		objectOptionDefaults:
			base.objectOptionDefaults === undefined && override.objectOptionDefaults === undefined
				? undefined
				: <TCustomMetadata = unknown>(
						name: number | string,
						fields: RestrictiveStringRecord<ImplicitFieldSchema>,
						options: ObjectSchemaOptionsAlpha<TCustomMetadata> | undefined,
					): ObjectSchemaOptionsAlpha<TCustomMetadata> | undefined => {
						const afterBase = base.objectOptionDefaults?.(name, fields, options) ?? options;
						return override.objectOptionDefaults?.(name, fields, afterBase) ?? afterBase;
					},
	};
}
