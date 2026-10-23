/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import type { RestrictiveStringRecord } from "../../util/index.js";
import type { ImplicitFieldSchema } from "../fieldSchema.js";

import type { ObjectSchemaOptionsAlpha } from "./schemaFactory.js";

/**
 * Configures default options for a {@link SchemaFactoryAlpha} instance.
 *
 * @remarks
 * Pass these options with the scope in one object to the {@link SchemaFactoryAlpha} constructor.
 *
 * Use {@link composeSchemaFactoryAlphaOptions} to combine two sets of options.
 *
 * @alpha @sealed
 */
export interface SchemaFactoryAlphaOptions {
	/**
	 * Sets options for each schema created with {@link SchemaFactoryAlpha.objectAlpha}.
	 *
	 * @param name - the schema name within the factory's scope
	 * @param fields - the schemas for the object's fields
	 * @param options - the options passed to the schema creation method, if any
	 *
	 * @typeParam TCustomMetadata - the type of custom metadata in the schema options
	 *
	 * @returns the options to use, or `undefined` to keep the per-call options unchanged
	 *
	 * @remarks
	 * This also applies to {@link SchemaFactoryAlpha.objectRecursive} and
	 * {@link SchemaFactoryAlpha.objectRecursiveAlpha}.
	 * It does not apply to {@link SchemaFactory.object}.
	 *
	 * Use this to set defaults such as
	 * {@link ObjectSchemaOptions.allowUnknownOptionalFields | allowUnknownOptionalFields}
	 * for all object schemas created with these methods.
	 * Spread the per-call options after the defaults to let callers override them.
	 *
	 * Use {@link composeSchemaFactoryAlphaOptions} to extend an existing factory's settings.
	 *
	 * @example
	 * ```typescript
	 * const sf = new SchemaFactoryAlpha({
	 *     scope: "com.example",
	 *     objectOptionDefaults: (_name, _fields, options) => ({
	 *         allowUnknownOptionalFields: true,
	 *         ...options,
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
 * Combines two sets of {@link SchemaFactoryAlphaOptions} by chaining their callbacks.
 *
 * @param base - the options whose callback runs first
 * @param override - the options whose callback runs second
 *
 * @returns options that apply the base callback, then the override callback
 *
 * @remarks
 * The base {@link SchemaFactoryAlphaOptions.objectOptionDefaults} callback runs first.
 * Its result is passed as the options argument to the override callback.
 * If either callback returns `undefined`, the options passed to that callback are kept.
 *
 * Use this with {@link SchemaFactoryAlpha.withOptionsAlpha} to extend a factory's defaults.
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
