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
	 * Whether object nodes may contain optional fields not declared in this schema.
	 *
	 * @remarks
	 * When you add optional fields to an application schema, older application versions may still need to collaborate on the same documents.
	 * Enabling this option on the older object schema lets its views tolerate the additional optional fields introduced by newer clients.
	 * Those views can continue to read and edit the fields they declare without exposing the additional fields through their property API.
	 * The same tolerance applies when a document contains unknown optional fields introduced through imports.
	 *
	 * This tolerance is limited to additional optional fields; it does not make other schema differences compatible.
	 * For example, the view cannot omit a required field or read an unsupported type in a field it declares.
	 *
	 * Because unknown optional fields are not exposed through the view's properties, copying those properties does not copy the entire stored node.
	 * This matters when implementing operations such as cloning: a new node constructed from the visible properties loses any unknown-field data.
	 * For example, suppose a newer client stores a person with a nickname, while an older client declares only the name:
	 *
	 * ```typescript
	 * const sf = new SchemaFactory("com.example");
	 * class PersonView extends sf.object("Person", { name: sf.string }, { allowUnknownOptionalFields: true }) {}
	 * class PersonStored extends sf.object("Person", { name: sf.string, nickname: sf.optional(sf.string) }) {}
	 *
	 * // With a `PersonView` view of the stored person, this copies `name` but loses `nickname`.
	 * function clonePerson(a: PersonView): PersonView {
	 * 	return new PersonView({ name: a.name });
	 * }
	 *
	 * // Spreading the visible properties has the same limitation.
	 * function clonePersonWithSpread(a: PersonView): PersonView {
	 * 	return new PersonView({ ...a });
	 * }
	 * ```
	 *
	 * To clone a node without losing unknown optional fields, use {@link (TreeBeta:interface).clone} rather than reconstructing it from its properties.
	 * Operations that move entire nodes, such as `moveTo` and `moveToEnd` on arrays, also preserve these fields because SharedTree moves the stored node rather than copying its visible properties.
	 *
	 * When transferring data through import and export APIs, check both sides of the operation for the same copying limitation.
	 * The {@link (TreeAlpha:interface).exportVerbose | exportVerbose} API with stored keys preserves unknown optional fields,
	 * but {@link Unhydrated} nodes produced by {@link TreeNode} constructors, insertable content, and {@link (TreeAlpha:interface).importVerbose | importVerbose} do not.
	 * Exporting those fields therefore does not guarantee that importing the result will preserve them.
	 * To detect whether a node contains unknown-field data that an operation could lose, use {@link (TreeAlpha:interface).hasUnknownChildren}.
	 *
	 * @defaultValue `true`
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
