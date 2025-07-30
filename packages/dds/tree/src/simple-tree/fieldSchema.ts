/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import type { ErasedType } from "@fluidframework/core-interfaces";
import { Lazy } from "@fluidframework/core-utils/internal";
import { UsageError } from "@fluidframework/telemetry-utils/internal";

import type { FieldKey } from "../core/index.js";
import type { FlexTreeHydratedContextMinimal } from "../feature-libraries/index.js";
import {
	type MakeNominal,
	brand,
	type UnionToIntersection,
	compareSets,
	type requireTrue,
	type areOnlyKeys,
	type JsonCompatibleReadOnlyObject,
} from "../util/index.js";

import type {
	TreeNodeSchema,
	TreeNode,
	UnhydratedFlexTreeNode,
	NormalizedAnnotatedAllowedTypes,
	ImplicitAllowedTypes,
	ImplicitAnnotatedAllowedTypes,
	UnannotateImplicitAllowedTypes,
	AllowedTypesMetadata,
	TreeNodeFromImplicitAllowedTypes,
	TreeLeafValue,
	InsertableTreeNodeFromImplicitAllowedTypes,
} from "./core/index.js";
import {
	isAnnotatedAllowedTypes,
	normalizeAllowedTypes,
	normalizeAnnotatedAllowedTypes,
	unannotateImplicitAllowedTypes,
} from "./core/index.js";

import type { SimpleFieldSchema } from "./simpleSchema.js";
import type { UnsafeUnknownSchema } from "./unsafeUnknownSchema.js";
import type { InsertableContent } from "./unhydratedFlexTreeFromInsertable.js";

/**
 * Kind of a field on an {@link TreeObjectNode}.
 * @remarks
 * More kinds may be added over time, so do not assume this is an exhaustive set.
 * See {@link FieldSchema} for where these are used, and {@link SchemaFactory} for how to create schema which use them.
 * @public
 */
export enum FieldKind {
	/**
	 * A field which can be empty or filled.
	 * @remarks
	 * Allows 0 or one child.
	 */
	Optional,
	/**
	 * A field which must always be filled.
	 * @remarks
	 * Only allows exactly one child.
	 */
	Required,
	/**
	 * A special readonly field used for node identifier strings.
	 * @remarks
	 * Only allows exactly one child.
	 *
	 * See {@link SchemaFactory.identifier} for more details.
	 */
	Identifier,
}

/**
 * Maps from a property key to its corresponding {@link FieldProps.key | stored key} for the provided
 * {@link ImplicitFieldSchema | field schema}.
 *
 * @remarks
 * If an explicit stored key was specified in the schema, it will be used.
 * Otherwise, the stored key is the same as the property key.
 */
export function getStoredKey(
	propertyKey: string,
	fieldSchema: ImplicitAnnotatedFieldSchema,
): FieldKey {
	return brand(getExplicitStoredKey(fieldSchema) ?? propertyKey);
}

/**
 * Gets the {@link FieldProps.key | stored key} specified by the schema, if one was explicitly specified.
 * Otherwise, returns undefined.
 */
export function getExplicitStoredKey(
	fieldSchema: ImplicitAnnotatedFieldSchema,
): string | undefined {
	return fieldSchema instanceof FieldSchema ? fieldSchema.props?.key : undefined;
}

/**
 * Additional information to provide to a {@link FieldSchema}.
 *
 * @typeParam TCustomMetadata - Custom metadata properties to associate with the field.
 * See {@link FieldSchemaMetadata.custom}.
 *
 * @public
 */
export interface FieldProps<TCustomMetadata = unknown> {
	/**
	 * The unique identifier of a field, used in the persisted form of the tree.
	 *
	 * @remarks
	 * If not explicitly set via the schema, this is the same as the schema's property key.
	 *
	 * Specifying a stored key that differs from the property key is particularly useful in refactoring scenarios.
	 * To update the developer-facing API, while maintaining backwards compatibility with existing SharedTree data,
	 * you can change the property key and specify the previous property key as the stored key.
	 *
	 * Notes:
	 *
	 * - Stored keys have no impact on standard JavaScript behavior, on tree nodes. For example, `Object.keys`
	 * will always return the property keys specified in the schema, ignoring any stored keys that differ from
	 * the property keys.
	 *
	 * - When specifying stored keys in an object schema, you must ensure that the final set of stored keys
	 * (accounting for those implicitly derived from property keys) contains no duplicates.
	 * This is validated at runtime.
	 *
	 * @example Refactoring code without breaking compatibility with existing data
	 *
	 * Consider some existing object schema:
	 *
	 * ```TypeScript
	 * class Point extends schemaFactory.object("Point", {
	 * 	xPosition: schemaFactory.number,
	 * 	yPosition: schemaFactory.number,
	 * 	zPosition: schemaFactory.optional(schemaFactory.number),
	 * });
	 * ```
	 *
	 * Developers using nodes of this type would access the the `xPosition` property as `point.xPosition`.
	 *
	 * We would like to refactor the schema to omit "Position" from the property keys, but application data has
	 * already been persisted using the original property keys. To maintain compatibility with existing data,
	 * we can refactor the schema as follows:
	 *
	 * ```TypeScript
	 * class Point extends schemaFactory.object("Point", {
	 * 	x: schemaFactory.required(schemaFactory.number, { key: "xPosition" }),
	 * 	y: schemaFactory.required(schemaFactory.number, { key: "yPosition" }),
	 * 	z: schemaFactory.optional(schemaFactory.number, { key: "zPosition" }),
	 * });
	 * ```
	 *
	 * Now, developers can access the `x` property as `point.x`, while existing data can still be collaborated on.
	 *
	 * @defaultValue If not specified, the key that is persisted is the property key that was specified in the schema.
	 */
	readonly key?: string;

	/**
	 * A default provider used for fields which were not provided any values.
	 * @privateRemarks
	 * We are using an erased type here, as we want to expose this API but `InsertableContent` and `NodeKeyManager` are not public.
	 */
	readonly defaultProvider?: DefaultProvider;

	/**
	 * Optional metadata to associate with the field.
	 *
	 * @remarks
	 * Note: this metadata is not persisted nor made part of the collaborative state; it is strictly client-local.
	 * Different clients in the same collaborative session may see different metadata for the same field.
	 */
	readonly metadata?: FieldSchemaMetadata<TCustomMetadata>;
}

/**
 * {@link FieldProps} extended with additional `alpha` options.
 *
 * @typeParam TCustomMetadata - Custom metadata properties to associate with the field.
 * See {@link FieldSchemaMetadata.custom}.
 *
 * @alpha @input
 */
export interface FieldPropsAlpha<TCustomMetadata = unknown>
	extends FieldProps<TCustomMetadata> {
	/**
	 * The persisted metadata for this schema element.
	 */
	readonly persistedMetadata?: JsonCompatibleReadOnlyObject | undefined;
}

/**
 * A {@link FieldProvider} which requires additional context in order to produce its content
 */
export type ContextualFieldProvider = (
	context: FlexTreeHydratedContextMinimal | "UseGlobalContext",
) => UnhydratedFlexTreeNode[];
/**
 * A {@link FieldProvider} which can produce its content in a vacuum.
 */
export type ConstantFieldProvider = () => UnhydratedFlexTreeNode[];
/**
 * A function which produces content for a field every time that it is called.
 */
export type FieldProvider = ContextualFieldProvider | ConstantFieldProvider;
/**
 * Returns true if the given {@link FieldProvider} is a {@link ConstantFieldProvider}
 */
export function isConstant(
	fieldProvider: FieldProvider,
): fieldProvider is ConstantFieldProvider {
	return fieldProvider.length === 0;
}

/**
 * Provides a default value for a field.
 * @remarks
 * If present in a `FieldSchema`, when constructing new tree content that field can be omitted, and a default will be provided.
 * @system @sealed @public
 */
export interface DefaultProvider extends ErasedType<"@fluidframework/tree.FieldProvider"> {}

export function extractFieldProvider(input: DefaultProvider): FieldProvider {
	return input as unknown as FieldProvider;
}

export function getDefaultProvider(input: FieldProvider): DefaultProvider {
	return input as unknown as DefaultProvider;
}

/**
 * Metadata associated with a {@link FieldSchema}.
 *
 * @remarks Specified via {@link FieldProps.metadata}.
 *
 * @sealed
 * @public
 */
export interface FieldSchemaMetadata<TCustomMetadata = unknown> {
	/**
	 * User-defined metadata.
	 */
	readonly custom?: TCustomMetadata;

	/**
	 * The description of the field.
	 *
	 * @remarks
	 *
	 * If provided, will be used by the system in scenarios where a description of the field is useful.
	 * E.g., when converting a field schema to {@link https://json-schema.org/ | JSON Schema}, this description will be
	 * used as the `description` field.
	 */
	readonly description?: string | undefined;
}

/**
 * Metadata associated with a {@link FieldSchema}. Includes fields used by alpha features.
 *
 * @remarks Specified via {@link FieldProps.metadata}.
 *
 * @sealed
 * @alpha
 */
export interface FieldSchemaMetadataAlpha<TCustomMetadata = unknown>
	extends FieldSchemaMetadata<TCustomMetadata> {
	/**
	 * The persisted metadata for this schema element.
	 */
	readonly persistedMetadata?: JsonCompatibleReadOnlyObject | undefined;
}

/**
 * Package internal construction API.
 */
export function createFieldSchema<
	Kind extends FieldKind,
	Types extends ImplicitAllowedTypes,
	TCustomMetadata = unknown,
>(
	kind: Kind,
	annotatedTypes: Types,
	props?: FieldProps<TCustomMetadata>,
): FieldSchemaAlpha<Kind, Types, TCustomMetadata>;

/**
 * Package internal construction API that supports annotations for allowed types.
 */
export function createFieldSchema<
	Kind extends FieldKind,
	Types extends ImplicitAnnotatedAllowedTypes,
	TCustomMetadata = unknown,
>(
	kind: Kind,
	annotatedTypes: Types,
	props?: FieldProps<TCustomMetadata>,
): FieldSchemaAlpha<Kind, UnannotateImplicitAllowedTypes<Types>, TCustomMetadata>;

export function createFieldSchema<
	Kind extends FieldKind,
	Types extends ImplicitAnnotatedAllowedTypes,
	TCustomMetadata = unknown,
>(
	kind: Kind,
	annotatedTypes: Types,
	props?: FieldProps<TCustomMetadata>,
): FieldSchemaAlpha<Kind, UnannotateImplicitAllowedTypes<Types>, TCustomMetadata> {
	return createFieldSchemaPrivate(kind, annotatedTypes, props);
}

/**
 * Implementation for {@link createFieldSchema}
 */
let createFieldSchemaPrivate: <
	Kind extends FieldKind,
	Types extends ImplicitAnnotatedAllowedTypes,
	TCustomMetadata,
>(
	kind: Kind,
	annotatedTypes: Types,
	props?: FieldProps<TCustomMetadata>,
) => FieldSchemaAlpha<Kind, UnannotateImplicitAllowedTypes<Types>, TCustomMetadata>;

/**
 * All policy for a specific field,
 * including functionality that does not have to be kept consistent across versions or deterministic.
 *
 * This can include policy for how to use this schema for "view" purposes, and well as how to expose editing APIs.
 * Use {@link SchemaFactory} to create the FieldSchema instances, for example {@link SchemaStatics.optional}.
 * @privateRemarks
 * Public access to the constructor is removed to prevent creating expressible but unsupported (or not stable) configurations.
 * {@link createFieldSchema} can be used internally to create instances.
 *
 * @typeParam TCustomMetadata - Custom metadata properties to associate with the field.
 * See {@link FieldSchemaMetadata.custom}.
 *
 * @remarks
 * All implementations of this are actually {@link FieldSchemaAlpha} which exposes some additional alpha APIs.
 *
 * @sealed @public
 */
export class FieldSchema<
	out Kind extends FieldKind = FieldKind,
	out Types extends ImplicitAllowedTypes = ImplicitAllowedTypes,
	out TCustomMetadata = unknown,
> {
	/**
	 * This class is used with instanceof, and therefore should have nominal typing.
	 * This field enforces that.
	 */
	protected _typeCheck!: MakeNominal;

	private readonly lazyTypes: Lazy<ReadonlySet<TreeNodeSchema>>;

	/**
	 * What types of tree nodes are allowed in this field.
	 * @remarks Counterpart to {@link FieldSchema.allowedTypes}, with any lazy definitions evaluated.
	 */
	public get allowedTypeSet(): ReadonlySet<TreeNodeSchema> {
		return this.lazyTypes.value;
	}

	/**
	 * True if and only if, when constructing a node with this field, a value must be provided for it.
	 */
	public readonly requiresValue: boolean;

	/**
	 * {@inheritDoc FieldProps.metadata}
	 */
	public get metadata(): FieldSchemaMetadata<TCustomMetadata> {
		return this.props?.metadata ?? {};
	}

	/**
	 * This class is `@sealed`: protected members like this constructor are for internal use only.
	 * Use {@link SchemaFactory} to create the FieldSchema instances.
	 */
	protected constructor(
		/**
		 * The {@link https://en.wikipedia.org/wiki/Kind_(type_theory) | kind } of this field.
		 * Determines the multiplicity, viewing and editing APIs as well as the merge resolution policy.
		 */
		public readonly kind: Kind,
		/**
		 * What types of tree nodes are allowed in this field.
		 */
		public readonly allowedTypes: Types,
		/**
		 * Optional properties associated with the field.
		 */
		public readonly props?: FieldProps<TCustomMetadata>,
	) {
		if (!(this instanceof FieldSchemaAlpha)) {
			throw new UsageError("FieldSchema is @sealed: sub-classing is not allowed.");
		}

		this.lazyTypes = new Lazy(() => normalizeAllowedTypes(this.allowedTypes));
		// TODO: optional fields should (by default) get a default provider that returns undefined, removing the need to special case them here:
		this.requiresValue =
			this.props?.defaultProvider === undefined && this.kind !== FieldKind.Optional;
	}
}

/**
 * {@link FieldSchema} including alpha APIs (currently {@link SimpleFieldSchema}).
 * @remarks
 * This class will go away once the alpha APIs are stable and implemented by {@link FieldSchema}.
 * @sealed @alpha
 */
export class FieldSchemaAlpha<
		Kind extends FieldKind = FieldKind,
		Types extends ImplicitAllowedTypes = ImplicitAllowedTypes,
		TCustomMetadata = unknown,
	>
	extends FieldSchema<Kind, Types, TCustomMetadata>
	implements SimpleFieldSchema
{
	private readonly lazyIdentifiers: Lazy<ReadonlySet<string>>;
	private readonly lazyAnnotatedTypes: Lazy<NormalizedAnnotatedAllowedTypes>;
	private readonly propsAlpha: FieldPropsAlpha<TCustomMetadata> | undefined;

	/**
	 * Metadata on the types of tree nodes allowed on this field.
	 */
	public readonly allowedTypesMetadata: AllowedTypesMetadata;

	/**
	 * Persisted metadata for this field schema.
	 */
	public get persistedMetadata(): JsonCompatibleReadOnlyObject | undefined {
		return this.propsAlpha?.persistedMetadata;
	}

	static {
		createFieldSchemaPrivate = <
			Kind2 extends FieldKind,
			Types2 extends ImplicitAnnotatedAllowedTypes,
			TCustomMetadata2,
		>(
			kind: Kind2,
			annotatedAllowedTypes: Types2,
			props?: FieldPropsAlpha<TCustomMetadata2>,
		) =>
			new FieldSchemaAlpha(
				kind,
				unannotateImplicitAllowedTypes(annotatedAllowedTypes),
				annotatedAllowedTypes,
				props,
			);
	}

	protected constructor(
		kind: Kind,
		types: Types,
		public readonly annotatedAllowedTypes: ImplicitAnnotatedAllowedTypes,
		props?: FieldPropsAlpha<TCustomMetadata>,
	) {
		super(kind, types, props);

		this.allowedTypesMetadata = isAnnotatedAllowedTypes(annotatedAllowedTypes)
			? annotatedAllowedTypes.metadata
			: {};
		this.lazyAnnotatedTypes = new Lazy(() =>
			normalizeAnnotatedAllowedTypes(annotatedAllowedTypes),
		);
		this.lazyIdentifiers = new Lazy(
			() =>
				// The allowed types identifiers filter out any that are staged
				// TODO:#38722 this should not filter out any that have been upgraded once the runtime schema upgrade
				// mechanism is implemented
				new Set(
					this.annotatedAllowedTypesNormalized.types

						.filter(({ metadata }) => metadata.stagedSchemaUpgrade === undefined)
						.map(({ type }) => type.identifier),
				),
		);
		this.propsAlpha = props;
	}

	public get allowedTypesIdentifiers(): ReadonlySet<string> {
		return this.lazyIdentifiers.value;
	}

	/**
	 * What types of tree nodes are allowed in this field and their annotations.
	 * @remarks Counterpart to {@link FieldSchemaAlpha.annotatedAllowedTypes}, with any lazy definitions evaluated.
	 */
	public get annotatedAllowedTypesNormalized(): NormalizedAnnotatedAllowedTypes {
		return this.lazyAnnotatedTypes.value;
	}
}

/**
 * Normalizes a {@link ImplicitFieldSchema} or {@link ImplicitAnnotatedFieldSchema} to a {@link FieldSchema}.
 * @internal
 */
export function normalizeFieldSchema(
	schema: ImplicitFieldSchema | ImplicitAnnotatedFieldSchema,
): FieldSchemaAlpha {
	return schema instanceof FieldSchema
		? (schema as FieldSchemaAlpha)
		: createFieldSchema(FieldKind.Required, schema);
}

/**
 * Returns true if the given {@link ImplicitFieldSchema} are equivalent, otherwise false.
 * @remarks Two ImplicitFieldSchema are considered equivalent if all of the following are true:
 * 1. They have the same {@link FieldKind | kinds}.
 * 2. They have {@link areFieldPropsEqual | equivalent FieldProps}.
 * 3. They have the same exact set of allowed types. The allowed types must be (respectively) reference equal.
 *
 * For example, comparing an ImplicitFieldSchema that is a {@link TreeNodeSchema} to an ImplicitFieldSchema that is a {@link FieldSchema}
 * will return true if they are the same kind, the FieldSchema has exactly one allowed type (the TreeNodeSchema), and they have equivalent FieldProps.
 */
export function areImplicitFieldSchemaEqual(
	a: ImplicitFieldSchema,
	b: ImplicitFieldSchema,
): boolean {
	return areFieldSchemaEqual(normalizeFieldSchema(a), normalizeFieldSchema(b));
}

/**
 * Returns true if the given {@link FieldSchema} are equivalent, otherwise false.
 * @remarks Two FieldSchema are considered equivalent if all of the following are true:
 * 1. They have the same {@link FieldKind | kinds}.
 * 2. They have {@link areFieldPropsEqual | equivalent FieldProps}.
 * 3. They have the same exact set of allowed types. The allowed types must be reference equal.
 */
export function areFieldSchemaEqual(a: FieldSchema, b: FieldSchema): boolean {
	if (a === b) {
		return true;
	}

	if (a.kind !== b.kind) {
		return false;
	}

	if (!areFieldPropsEqual(a.props, b.props)) {
		return false;
	}

	return compareSets({ a: a.allowedTypeSet, b: b.allowedTypeSet });
}

/**
 * Returns true if the given {@link FieldProps} are equivalent, otherwise false.
 * @remarks FieldProps are considered equivalent if their keys and default providers are reference equal, and their metadata are {@link areMetadataEqual | equivalent}.
 */
function areFieldPropsEqual(a: FieldProps | undefined, b: FieldProps | undefined): boolean {
	// If any new fields are added to FieldProps, this check will stop compiling as a reminder that this function needs to be updated.
	type _keys = requireTrue<areOnlyKeys<FieldProps, "key" | "defaultProvider" | "metadata">>;

	if (a === b) {
		return true;
	}

	if (a?.key !== b?.key || a?.defaultProvider !== b?.defaultProvider) {
		return false;
	}

	if (!areMetadataEqual(a?.metadata, b?.metadata)) {
		return false;
	}

	return true;
}

/**
 * Returns true if the given {@link FieldSchemaMetadata} are equivalent, otherwise false.
 * @remarks FieldSchemaMetadata are considered equivalent if their custom data and descriptions are (respectively) reference equal.
 */
function areMetadataEqual(
	a: FieldSchemaMetadataAlpha | undefined,
	b: FieldSchemaMetadataAlpha | undefined,
): boolean {
	// If any new fields are added to FieldSchemaMetadata, this check will stop compiling as a reminder that this function needs to be updated.
	type _keys = requireTrue<
		areOnlyKeys<FieldSchemaMetadataAlpha, "custom" | "description" | "persistedMetadata">
	>;

	if (a === b) {
		return true;
	}

	return (
		Object.is(a?.custom, b?.custom) &&
		a?.description === b?.description &&
		arePersistedMetadataEqual(a?.persistedMetadata, b?.persistedMetadata)
	);
}

/**
 * Returns true if the given persisted metadata fields are equivalent, otherwise false.
 * @remarks
 * Currently only handles shallow equality in the case where the keys are in the same order. This is acceptable for current use cases.
 */
function arePersistedMetadataEqual(
	a: JsonCompatibleReadOnlyObject | undefined,
	b: JsonCompatibleReadOnlyObject | undefined,
): boolean {
	if (Object.is(a, b)) {
		return true;
	}

	if (a === undefined || b === undefined) {
		return false;
	}

	// Note that the key order matters. If `a` and `b` have the same content but the keys are in a different order,
	// this method will return false.
	const aStringified = JSON.stringify(a);
	const bStringified = JSON.stringify(b);

	return aStringified === bStringified;
}

/**
 * Schema for a field of a tree node.
 * @remarks
 * Implicitly treats {@link ImplicitAllowedTypes} as a Required field of that type.
 * @public
 */
export type ImplicitFieldSchema = FieldSchema | ImplicitAllowedTypes;

/**
 * Annotated schema for a field of a tree node.
 * @alpha
 */
export type ImplicitAnnotatedFieldSchema = FieldSchema | ImplicitAnnotatedAllowedTypes;

/**
 * Removes annotations from an annotated field schema.
 * @system @alpha
 */
export type UnannotateImplicitFieldSchema<T extends ImplicitAnnotatedFieldSchema> =
	T extends ImplicitAnnotatedAllowedTypes ? UnannotateImplicitAllowedTypes<T> : T;

/**
 * Converts an `ImplicitFieldSchema` to a property type suitable for reading a field with this that schema.
 *
 * @typeparam TSchema - When non-exact schema are provided this errors on the side of returning too general of a type (a conservative union of all possibilities).
 * This is ideal for "output APIs" - i.e. it converts the schema type to the runtime type that a user will _read_ from the tree.
 * Examples of such "non-exact" schema include `ImplicitFieldSchema`, `ImplicitAllowedTypes`, and  TypeScript unions of schema types.
 * @public
 */
export type TreeFieldFromImplicitField<TSchema extends ImplicitFieldSchema = FieldSchema> =
	TSchema extends FieldSchema<infer Kind, infer Types>
		? ApplyKind<TreeNodeFromImplicitAllowedTypes<Types>, Kind>
		: TSchema extends ImplicitAllowedTypes
			? TreeNodeFromImplicitAllowedTypes<TSchema>
			: TreeNode | TreeLeafValue | undefined;

/**
 * Type of content that can be inserted into the tree for a field of the given schema.
 *
 * @see {@link Input}
 *
 * @typeparam TSchemaInput - Schema to process.
 * @typeparam TSchema - Do not specify: default value used as implementation detail.
 * @public
 */
export type InsertableTreeFieldFromImplicitField<
	TSchemaInput extends ImplicitFieldSchema,
	TSchema = UnionToIntersection<TSchemaInput>,
> = [TSchema] extends [FieldSchema<infer Kind, infer Types>]
	? ApplyKindInput<InsertableTreeNodeFromImplicitAllowedTypes<Types>, Kind, true>
	: [TSchema] extends [ImplicitAllowedTypes]
		? InsertableTreeNodeFromImplicitAllowedTypes<TSchema>
		: never;

/**
 * Content which could be inserted into a field within a tree.
 *
 * @see {@link Input}
 * @remarks
 * Extended version of {@link InsertableTreeFieldFromImplicitField} that also allows {@link (UnsafeUnknownSchema:type)}.
 * @alpha
 */
export type InsertableField<TSchema extends ImplicitFieldSchema | UnsafeUnknownSchema> = [
	TSchema,
] extends [ImplicitFieldSchema]
	? InsertableTreeFieldFromImplicitField<TSchema>
	: [TSchema] extends [UnsafeUnknownSchema]
		? InsertableContent | undefined
		: never;

/**
 * Content which could be read from a field within a tree.
 *
 * @remarks
 * Extended version of {@link TreeFieldFromImplicitField} that also allows {@link (UnsafeUnknownSchema:type)}.
 * Since reading from fields with non-exact schema is still safe, this is only useful (compared to {@link TreeFieldFromImplicitField}) when the schema is also used as input and thus allows {@link (UnsafeUnknownSchema:type)}
 * for use
 * @system @alpha
 */
export type ReadableField<TSchema extends ImplicitFieldSchema | UnsafeUnknownSchema> =
	TreeFieldFromImplicitField<ReadSchema<TSchema>>;

/**
 * Adapter to remove {@link (UnsafeUnknownSchema:type)} from a schema type so it can be used with types for generating APIs for reading data.
 *
 * @remarks
 * Since reading with non-exact schema is still safe, this is mainly useful when the schema is also used as input and thus allows {@link (UnsafeUnknownSchema:type)}.
 * @system @alpha
 */
export type ReadSchema<TSchema extends ImplicitFieldSchema | UnsafeUnknownSchema> = [
	TSchema,
] extends [ImplicitFieldSchema]
	? TSchema
	: ImplicitFieldSchema;

/**
 * Suitable for output.
 * For input must error on side of excluding undefined instead.
 * @system @public
 */
export type ApplyKind<T, Kind extends FieldKind> = {
	[FieldKind.Required]: T;
	[FieldKind.Optional]: T | undefined;
	[FieldKind.Identifier]: T;
}[Kind];

/**
 * Suitable for input.
 *
 * @see {@link Input}
 * @system @public
 */
export type ApplyKindInput<T, Kind extends FieldKind, DefaultsAreOptional extends boolean> = [
	Kind,
] extends [FieldKind.Required]
	? T
	: [Kind] extends [FieldKind.Optional]
		? T | undefined
		: [Kind] extends [FieldKind.Identifier]
			? DefaultsAreOptional extends true
				? T | undefined
				: T
			: never;
