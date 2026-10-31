/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import type {
	JsonCompatibleReadOnlyObject,
	RestrictiveStringRecord,
} from "../../util/index.js";
import type { NodeSchemaMetadata } from "../core/index.js";
import type { ImplicitFieldSchema } from "../fieldSchema.js";

/**
 * Options when declaring an {@link SchemaFactory.object|object node}'s schema.
 *
 * @input
 * @public
 */
export interface ObjectSchemaOptions {
	/**
	 * Allow nodes typed with this object node schema to contain optional fields that are not present in the schema declaration.
	 * Such nodes can come into existence either via import APIs (see remarks) or by way of collaboration with another client
	 * that has upgraded the document's schema to include those optional fields.
	 *
	 * @defaultValue `false`
	 * @remarks
	 * The advantage of enabling this option is that it allows an application ecosystem with staged rollout to more quickly
	 * upgrade documents to include schema for new optional features.
	 *
	 * However, it does come with trade-offs that applications should weigh carefully when it comes to interactions between
	 * code and documents.
	 * When opening such documents, the API presented is still determined by the view schema.
	 * This can have implications on the behavior of edits or code which uses portions of the view schema,
	 * since this may inadvertently drop data which is present in those optional fields in the document schema.
	 *
	 * Consider the following example:
	 *
	 * ```typescript
	 * const sf = new SchemaFactory("com.example");
	 * class PersonView extends sf.object("Person", { name: sf.string }, { allowUnknownOptionalFields: true }) {}
	 * class PersonStored extends sf.object("Person", { name: sf.string, nickname: sf.optional(sf.string) }) {}
	 *
	 * // Say we have a document which uses `PersonStored` in its schema, and application code constructs
	 * // a tree view using `PersonView`. If the application for some reason had implemented a function like this:
	 * function clonePerson(a: PersonView): PersonView {
	 * 	return new PersonView({ name: a.name });
	 * }
	 * // ...or even like this:
	 * function clonePerson(a: PersonView): PersonView {
	 *  return new PersonView({ ...a})
	 * }
	 * // Then the alleged clone wouldn't actually clone the entire person in either case, it would drop the nickname.
	 * ```
	 *
	 * The existing import and export APIs have similar problems.
	 * For example currently the {@link (TreeAlpha:interface).exportVerbose|exportVerbose} API with stored keys preserves unknown optional fields,
	 * but {@link Unhydrated} nodes produced by {@link TreeNode} constructors, insertable content, and {@link (TreeAlpha:interface).importVerbose|importVerbose} do not.
	 * {@link (TreeBeta:interface).clone} however can be used to clone a node preserving unknown optional fields.
	 * To check if a node has content in unknown optional fields, use {@link (TreeAlpha:interface).hasUnknownChildren}.
	 *
	 * Note that public API methods which operate on entire nodes (such as `moveTo`, `moveToEnd`, etc. on arrays) do not encounter
	 * this problem as SharedTree's implementation stores the entire node in its lower layers.
	 * It's only when application code reaches into a node
	 * (either by accessing its fields, spreading it, or some other means) that this problem arises.
	 */
	readonly allowUnknownOptionalFields?: boolean;
}

/**
 * Options when declaring an {@link SchemaFactoryBeta.object|object node}'s schema, including custom metadata.
 *
 * @typeParam TCustomMetadata - Custom metadata properties to associate with the node schema.
 * See {@link NodeSchemaMetadata.custom}.
 *
 * @input
 * @beta
 */
export interface ObjectSchemaOptionsBeta<TCustomMetadata = unknown>
	extends ObjectSchemaOptions,
		NodeSchemaOptions<TCustomMetadata> {}

/**
 * Options when declaring an {@link SchemaFactory.object|object node}'s schema
 *
 * @input
 * @alpha
 */
export interface ObjectSchemaOptionsAlpha<TCustomMetadata = unknown>
	extends ObjectSchemaOptionsBeta<TCustomMetadata>,
		NodeSchemaOptionsAlpha<TCustomMetadata> {}

/**
 * Default options for Object node schema creation.
 * @remarks Omits parameters that are not relevant for common use cases.
 */
export const defaultSchemaFactoryObjectOptions: Required<ObjectSchemaOptions> = {
	allowUnknownOptionalFields: false,
};

/**
 * Additional information to provide to Node Schema creation.
 *
 * @typeParam TCustomMetadata - Custom metadata properties to associate with the Node Schema.
 * See {@link NodeSchemaMetadata.custom}.
 *
 * @input
 * @public
 */
export interface NodeSchemaOptions<out TCustomMetadata = unknown> {
	/**
	 * Optional metadata to associate with the Node Schema.
	 *
	 * @remarks
	 * This specifies {@link SimpleNodeSchemaBase.metadata} which has more details about its use.
	 */
	readonly metadata?: NodeSchemaMetadata<TCustomMetadata> | undefined;
}

/**
 * Additional information to provide to Node Schema creation. Includes fields for alpha features.
 *
 * @typeParam TCustomMetadata - Custom metadata properties to associate with the Node Schema.
 * See {@link NodeSchemaMetadata.custom}.
 *
 * @input
 * @alpha
 */
export interface NodeSchemaOptionsAlpha<out TCustomMetadata = unknown>
	extends NodeSchemaOptions<TCustomMetadata> {
	/**
	 * The persisted metadata for this schema element.
	 * @remarks
	 * This gets exposed via {@link SimpleNodeSchemaBaseAlpha.persistedMetadata}.
	 */
	readonly persistedMetadata?: JsonCompatibleReadOnlyObject | undefined;
}

/**
 * Configures default options for a {@link SchemaFactoryBeta} instance.
 *
 * @remarks
 * Pass one object with these options and the scope to {@link SchemaFactoryBeta}.
 * You can create these options and read them from {@link SchemaFactoryBeta.settings}.
 *
 * Use {@link composeSchemaFactoryBetaOptions} to combine two sets of options.
 *
 * @beta
 */
export interface SchemaFactoryBetaOptions {
	/**
	 * Sets options for each schema created with {@link SchemaFactoryBeta.object}.
	 *
	 * @param name - The schema name within the factory's scope.
	 * @param fields - The schemas for the object's fields.
	 * @param options - The options passed to the schema creation method, if any.
	 *
	 * @typeParam TCustomMetadata - The type of custom metadata in the schema options.
	 *
	 * @returns The options to use, or `undefined` to keep the per-call options unchanged.
	 *
	 * @remarks
	 * This also applies to {@link SchemaFactoryBeta.objectRecursive}.
	 * It does not change {@link SchemaFactory} instances.
	 *
	 * The callback can choose options based on the schema's name, fields, and per-call options.
	 * It controls how factory defaults and per-call options are combined.
	 *
	 * Use this to set defaults such as
	 * {@link ObjectSchemaOptions.allowUnknownOptionalFields | allowUnknownOptionalFields}
	 * for object schemas.
	 * Spread the per-call options after the defaults to let callers override them.
	 *
	 * @example
	 * ```typescript
	 * const sf = new SchemaFactoryBeta({
	 *     scope: "com.example",
	 *     objectOptions: (_name, _fields, options) => ({
	 *         allowUnknownOptionalFields: true,
	 *         ...options,
	 *     }),
	 * });
	 * ```
	 */
	readonly objectOptions?: <TCustomMetadata = unknown>(
		name: number | string,
		fields: RestrictiveStringRecord<ImplicitFieldSchema>,
		options: ObjectSchemaOptionsBeta<TCustomMetadata> | undefined,
	) => ObjectSchemaOptionsBeta<TCustomMetadata> | undefined;
}

/**
 * Configures default options for a {@link SchemaFactoryAlpha} instance.
 *
 * @remarks
 * Pass one object with these options and the scope to {@link SchemaFactoryAlpha}.
 * You can create these options and read them from {@link SchemaFactoryAlpha.settings}.
 *
 * Use {@link composeSchemaFactoryAlphaOptions} to combine two sets of options.
 *
 * @alpha
 */
export interface SchemaFactoryAlphaOptions extends SchemaFactoryBetaOptions {
	/**
	 * Sets options for each schema created with {@link SchemaFactoryAlpha.objectAlpha}.
	 *
	 * @param name - The schema name within the factory's scope.
	 * @param fields - The schemas for the object's fields.
	 * @param options - The options passed to the schema creation method, if any.
	 *
	 * @typeParam TCustomMetadata - The type of custom metadata in the schema options.
	 *
	 * @returns The options to use, or `undefined` to keep the per-call options unchanged.
	 *
	 * @remarks
	 * This also applies to the inherited {@link SchemaFactoryBeta.object} method,
	 * {@link SchemaFactoryAlpha.objectRecursive}, and
	 * {@link SchemaFactoryAlpha.objectRecursiveAlpha}.
	 * It does not change {@link SchemaFactory} instances.
	 *
	 * The callback can choose options based on the schema's name, fields, and per-call options.
	 * It controls how factory defaults and per-call options are combined.
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
	 *     objectOptions: (_name, _fields, options) => ({
	 *         allowUnknownOptionalFields: true,
	 *         ...options,
	 *     }),
	 * });
	 * ```
	 */
	readonly objectOptions?: <TCustomMetadata = unknown>(
		name: number | string,
		fields: RestrictiveStringRecord<ImplicitFieldSchema>,
		options: ObjectSchemaOptionsAlpha<TCustomMetadata> | undefined,
	) => ObjectSchemaOptionsAlpha<TCustomMetadata> | undefined;
}

/**
 * Combines two sets of {@link SchemaFactoryAlphaOptions} by chaining their callbacks.
 *
 * @param base - The options whose callback runs first.
 * @param override - The options whose callback runs second.
 *
 * @returns Options that apply the base callback, then the override callback.
 *
 * @remarks
 * The base {@link SchemaFactoryAlphaOptions.objectOptions} callback runs first.
 * Its result is passed as the options argument to the override callback.
 * If either callback returns `undefined`, the options passed to that callback are kept.
 *
 * Spreading the options objects would replace the base callback.
 * This helper keeps both callbacks.
 *
 * Use this with {@link SchemaFactoryAlpha.(createDerivedFactory:1)} to extend a factory's defaults.
 *
 * @example
 * ```typescript
 * const extended = sf.createDerivedFactory(
 *     composeSchemaFactoryAlphaOptions(sf.settings, {
 *         objectOptions: (_name, _fields, options) => ({
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
	return composeSchemaFactoryBetaOptions(base, override);
}

/**
 * Combines two sets of {@link SchemaFactoryBetaOptions} by chaining their callbacks.
 *
 * @param base - The options whose callback runs first.
 * @param override - The options whose callback runs second.
 *
 * @returns Options that apply the base callback, then the override callback.
 *
 * @remarks
 * The base {@link SchemaFactoryBetaOptions.objectOptions} callback runs first.
 * Its result is passed as the options argument to the override callback.
 * If either callback returns `undefined`, the options passed to that callback are kept.
 *
 * Spreading the options objects would replace the base callback.
 * This helper keeps both callbacks.
 *
 * Use this with {@link SchemaFactoryBeta.(createDerivedFactory:1)} to extend a factory's defaults.
 *
 * @example
 * ```typescript
 * const extended = sf.createDerivedFactory(
 *     composeSchemaFactoryBetaOptions(sf.settings, {
 *         objectOptions: (_name, _fields, options) => ({
 *             allowUnknownOptionalFields: true,
 *             ...options,
 *         }),
 *     }),
 * );
 * ```
 *
 * @beta
 */
export function composeSchemaFactoryBetaOptions(
	base: SchemaFactoryBetaOptions,
	override: SchemaFactoryBetaOptions,
): SchemaFactoryBetaOptions {
	return {
		objectOptions:
			base.objectOptions === undefined && override.objectOptions === undefined
				? undefined
				: <TCustomMetadata = unknown>(
						name: number | string,
						fields: RestrictiveStringRecord<ImplicitFieldSchema>,
						options: ObjectSchemaOptionsBeta<TCustomMetadata> | undefined,
					): ObjectSchemaOptionsBeta<TCustomMetadata> | undefined => {
						const afterBase = base.objectOptions?.(name, fields, options) ?? options;
						return override.objectOptions?.(name, fields, afterBase) ?? afterBase;
					},
	};
}
