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
	 * These fields can have been added by a newer application version or omitted from the view by a version that retires a feature.
	 *
	 * @defaultValue `true`
	 * @remarks
	 * This option supports both adding optional fields and removing them from application schema declarations.
	 * An older view can tolerate optional fields added by a newer application version.
	 * A view that omits an optional field can also read and edit older documents that still contain it.
	 * This supports user scenarios like rolling back application code or retiring an optional feature without deleting its stored data.
	 *
	 * When upgrading an existing document, SharedTree retains omitted optional fields and the node definitions they require.
	 * The view can make later compatible schema upgrades without restoring those fields to its declarations.
	 * The object type's stored identifier and the stored keys of its remaining fields must still identify the same schema.
	 * This option does not permit omitting required fields or reading unsupported types in fields that the view still declares.
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
 * @input
 * @public
 */
export interface SchemaFactoryOptions {
	/**
	 * Options for schemas created with {@link SchemaFactory.object}.
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
 * @input
 * @beta
 */
export interface SchemaFactoryBetaOptions extends SchemaFactoryOptions {
	/**
	 * Options for schemas created with {@link SchemaFactoryBeta.object}.
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
	 *
	 * @privateRemarks
	 * Note: for now, factory-level custom metadata is not supported.
	 * This can be added in the future as needed by adding the necessary type parameter to this type and forwarding it here.
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
 * @input
 * @alpha
 */
export interface SchemaFactoryAlphaOptions extends SchemaFactoryBetaOptions {
	/**
	 * Options for schemas created with {@link SchemaFactoryAlpha.objectAlpha}.
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
	 *
	 * @privateRemarks
	 * Note: for now, factory-level custom metadata is not supported.
	 * This can be added in the future as needed by adding the necessary type parameter to this type and forwarding it here.
	 */
	readonly objectOptions?: ObjectSchemaOptionsAlpha<never>;
}
