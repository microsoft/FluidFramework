/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import type { JsonCompatibleReadOnlyObject } from "../../util/index.js";
import type { NodeSchemaMetadata } from "../core/index.js";

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
 * Configures default options for a {@link SchemaFactory} instance.
 *
 * @remarks
 * Pass one object with these options and the scope to {@link SchemaFactory}.
 * You can create these options and read them from {@link SchemaFactory.settings}.
 *
 * Spread these options and their `objectOptions` to create replacement settings for
 * {@link SchemaFactory.scopedFactory}.
 *
 * @public
 */
export interface SchemaFactoryOptions {
	/**
	 * Default options for schemas created with {@link SchemaFactory.object}.
	 *
	 * @remarks
	 * This also applies to {@link SchemaFactory.objectRecursive}.
	 *
	 * Options passed to the schema creation method override these defaults.
	 * Options are combined with a shallow merge.
	 *
	 * Use this to set defaults such as
	 * {@link ObjectSchemaOptions.allowUnknownOptionalFields | allowUnknownOptionalFields}
	 * for object schemas.
	 *
	 * @example
	 * ```typescript
	 * const sf = new SchemaFactory({
	 *     scope: "com.example",
	 *     objectOptions: {
	 *         allowUnknownOptionalFields: true,
	 *     },
	 * });
	 * ```
	 */
	readonly objectOptions?: ObjectSchemaOptions;
}

/**
 * Configures default options for a {@link SchemaFactoryBeta} instance.
 *
 * @remarks
 * Pass one object with these options and the scope to {@link SchemaFactoryBeta}.
 * You can create these options and read them from {@link SchemaFactoryBeta.settings}.
 *
 * Spread these options and their `objectOptions` to create replacement settings for
 * {@link SchemaFactoryBeta.scopedFactory}.
 *
 * @beta
 */
export interface SchemaFactoryBetaOptions extends SchemaFactoryOptions {
	/**
	 * Default options for schemas created with {@link SchemaFactoryBeta.object}.
	 *
	 * @remarks
	 * This also applies to {@link SchemaFactoryBeta.objectRecursive}.
	 * Options passed to the schema creation method override these defaults.
	 * Options are combined with a shallow merge, so per-schema metadata replaces the default metadata.
	 * Custom metadata must be provided per-schema to preserve its inferred type.
	 *
	 * Use this to set defaults such as
	 * {@link ObjectSchemaOptions.allowUnknownOptionalFields | allowUnknownOptionalFields}
	 * for object schemas.
	 *
	 * @example
	 * ```typescript
	 * const sf = new SchemaFactoryBeta({
	 *     scope: "com.example",
	 *     objectOptions: {
	 *         allowUnknownOptionalFields: true,
	 *         metadata: { description: "Default description" },
	 *     },
	 * });
	 * ```
	 */
	readonly objectOptions?: ObjectSchemaOptionsBeta<never>;
}

/**
 * Configures default options for a {@link SchemaFactoryAlpha} instance.
 *
 * @remarks
 * Pass one object with these options and the scope to {@link SchemaFactoryAlpha}.
 * You can create these options and read them from {@link SchemaFactoryAlpha.settings}.
 *
 * Spread these options and their `objectOptions` to create replacement settings for
 * {@link SchemaFactoryAlpha.scopedFactory}.
 *
 * @alpha
 */
export interface SchemaFactoryAlphaOptions extends SchemaFactoryBetaOptions {
	/**
	 * Default options for schemas created with {@link SchemaFactoryAlpha.objectAlpha}.
	 *
	 * @remarks
	 * This also applies to the inherited {@link SchemaFactoryBeta.object} method,
	 * {@link SchemaFactoryAlpha.objectRecursive}, and
	 * {@link SchemaFactoryAlpha.objectRecursiveAlpha}.
	 *
	 * Options passed to the schema creation method override these defaults.
	 * Options are combined with a shallow merge, so per-schema metadata replaces the default metadata.
	 * Custom metadata must be provided per-schema to preserve its inferred type.
	 *
	 * Use this to set defaults such as
	 * {@link ObjectSchemaOptions.allowUnknownOptionalFields | allowUnknownOptionalFields}
	 * for all object schemas created with these methods.
	 *
	 * @example
	 * ```typescript
	 * const sf = new SchemaFactoryAlpha({
	 *     scope: "com.example",
	 *     objectOptions: {
	 *         allowUnknownOptionalFields: true,
	 *         persistedMetadata: { library: "com.example" },
	 *     },
	 * });
	 * ```
	 */
	readonly objectOptions?: ObjectSchemaOptionsAlpha<never>;
}
