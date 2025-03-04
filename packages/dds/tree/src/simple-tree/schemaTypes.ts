/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import type { ErasedType, IFluidHandle } from "@fluidframework/core-interfaces";
import { Lazy } from "@fluidframework/core-utils/internal";
import { UsageError } from "@fluidframework/telemetry-utils/internal";

import type { NodeKeyManager } from "../feature-libraries/index.js";
import {
	type MakeNominal,
	brand,
	isReadonlyArray,
	type UnionToIntersection,
	compareSets,
	type requireTrue,
	type areOnlyKeys,
	getOrCreate,
} from "../util/index.js";
import {
	type Unhydrated,
	type NodeKind,
	type TreeNodeSchema,
	type TreeNodeSchemaClass,
	type TreeNode,
	type TreeNodeSchemaCore,
	type TreeNodeSchemaNonClass,
	inPrototypeChain,
} from "./core/index.js";
import type { FieldKey } from "../core/index.js";
import type { InsertableContent } from "./toMapTree.js";
import { isLazy, type FlexListToUnion, type LazyItem } from "./flexList.js";
import { LeafNodeSchema } from "./leafNodeSchema.js";
import { TreeNodeValid } from "./treeNodeValid.js";

/**
 * Returns true if the given schema is a {@link TreeNodeSchemaClass}, or otherwise false if it is a {@link TreeNodeSchemaNonClass}.
 * @internal
 */
export function isTreeNodeSchemaClass<
	Name extends string,
	Kind extends NodeKind,
	TNode extends TreeNode | TreeLeafValue,
	TBuild,
	ImplicitlyConstructable extends boolean,
	Info,
>(
	schema:
		| TreeNodeSchema<Name, Kind, TNode, TBuild, ImplicitlyConstructable, Info>
		| TreeNodeSchemaClass<Name, Kind, TNode & TreeNode, TBuild, ImplicitlyConstructable, Info>,
): schema is TreeNodeSchemaClass<
	Name,
	Kind,
	TNode & TreeNode,
	TBuild,
	ImplicitlyConstructable,
	Info
> {
	return schema.constructor !== undefined;
}

/**
 * Types for use in fields.
 * @remarks
 * Type constraint used in schema declaration APIs.
 *
 * The order of types in the array is not significant.
 * Additionally, it is legal for users of this type to have the runtime and compile time order of items within this array not match.
 * Therefor to ensure type safety, these arrays should not be indexed, and instead just be iterated.
 *
 * Ideally this restriction would be modeled in the type itself, but it is not ergonomic to do so as there is no easy (when compared to arrays)
 * way to declare and manipulate unordered sets of types in TypeScript.
 *
 * Not intended for direct use outside of package.
 * @privateRemarks
 * Code reading data from this should use `normalizeAllowedTypes` to ensure consistent handling, caching, nice errors etc.
 * @system @public
 */
export type AllowedTypes = readonly LazyItem<TreeNodeSchema>[];

/**
 * Kind of a field on a node.
 * @remarks
 * More kinds may be added over time, so do not assume this is an exhaustive set.
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
	 * A special field used for node identifiers.
	 * @remarks
	 * Only allows exactly one child.
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
export function getStoredKey(propertyKey: string, fieldSchema: ImplicitFieldSchema): FieldKey {
	return brand(getExplicitStoredKey(fieldSchema) ?? propertyKey);
}

/**
 * Gets the {@link FieldProps.key | stored key} specified by the schema, if one was explicitly specified.
 * Otherwise, returns undefined.
 */
export function getExplicitStoredKey(fieldSchema: ImplicitFieldSchema): string | undefined {
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
 * A {@link FieldProvider} which requires additional context in order to produce its content
 */
export type ContextualFieldProvider = (
	context: NodeKeyManager,
) => InsertableContent | undefined;
/**
 * A {@link FieldProvider} which can produce its content in a vacuum
 */
export type ConstantFieldProvider = () => InsertableContent | undefined;
/**
 * A function which produces content for a field every time that it is called
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
 * Package internal construction API.
 */
export let createFieldSchema: <
	Kind extends FieldKind = FieldKind,
	Types extends ImplicitAllowedTypes = ImplicitAllowedTypes,
	TCustomMetadata = unknown,
>(
	kind: Kind,
	allowedTypes: Types,
	props?: FieldProps<TCustomMetadata>,
) => FieldSchema<Kind, Types, TCustomMetadata>;

/**
 * All policy for a specific field,
 * including functionality that does not have to be kept consistent across versions or deterministic.
 *
 * This can include policy for how to use this schema for "view" purposes, and well as how to expose editing APIs.
 * Use {@link SchemaFactory} to create the FieldSchema instances, for example {@link schemaStatics.optional}.
 * @privateRemarks
 * Public access to the constructor is removed to prevent creating expressible but unsupported (or not stable) configurations.
 * {@link createFieldSchema} can be used internally to create instances.
 *
 * @typeParam TCustomMetadata - Custom metadata properties to associate with the field.
 * See {@link FieldSchemaMetadata.custom}.
 *
 * @sealed @public
 */
export class FieldSchema<
	out Kind extends FieldKind = FieldKind,
	out Types extends ImplicitAllowedTypes = ImplicitAllowedTypes,
	out TCustomMetadata = unknown,
> {
	static {
		createFieldSchema = <
			Kind2 extends FieldKind = FieldKind,
			Types2 extends ImplicitAllowedTypes = ImplicitAllowedTypes,
			TCustomMetadata2 = unknown,
		>(
			kind: Kind2,
			allowedTypes: Types2,
			props?: FieldProps<TCustomMetadata2>,
		) => new FieldSchema(kind, allowedTypes, props);
	}
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
	public get metadata(): FieldSchemaMetadata<TCustomMetadata> | undefined {
		return this.props?.metadata;
	}

	private constructor(
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
		this.lazyTypes = new Lazy(() => normalizeAllowedTypes(this.allowedTypes));
		// TODO: optional fields should (by default) get a default provider that returns undefined, removing the need to special case them here:
		this.requiresValue =
			this.props?.defaultProvider === undefined && this.kind !== FieldKind.Optional;
	}
}

/**
 * Normalizes a {@link ImplicitFieldSchema} to a {@link FieldSchema}.
 */
export function normalizeFieldSchema(schema: ImplicitFieldSchema): FieldSchema {
	return schema instanceof FieldSchema
		? schema
		: createFieldSchema(FieldKind.Required, schema);
}
/**
 * Normalizes a {@link ImplicitAllowedTypes} to a set of {@link TreeNodeSchema}s, by eagerly evaluating any
 * lazy schema declarations.
 *
 * @remarks Note: this must only be called after all required schemas have been declared, otherwise evaluation of
 * recursive schemas may fail.
 *
 * @internal
 */
export function normalizeAllowedTypes(
	types: ImplicitAllowedTypes,
): ReadonlySet<TreeNodeSchema> {
	const normalized = new Set<TreeNodeSchema>();
	if (isReadonlyArray(types)) {
		// Types array must not be modified after it is normalized since that would result if the user of the normalized data having wrong (out of date) content.
		Object.freeze(types);
		for (const lazyType of types) {
			normalized.add(evaluateLazySchema(lazyType));
		}
	} else {
		normalized.add(evaluateLazySchema(types));
	}
	return normalized;
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
	a: FieldSchemaMetadata | undefined,
	b: FieldSchemaMetadata | undefined,
): boolean {
	// If any new fields are added to FieldSchemaMetadata, this check will stop compiling as a reminder that this function needs to be updated.
	type _keys = requireTrue<areOnlyKeys<FieldSchemaMetadata, "custom" | "description">>;

	if (a === b) {
		return true;
	}

	return a?.custom === b?.custom && a?.description === b?.description;
}

const cachedLazyItem = new WeakMap<() => unknown, unknown>();

function evaluateLazySchema<T extends TreeNodeSchema>(value: LazyItem<T>): T {
	const evaluatedSchema = isLazy(value)
		? (getOrCreate(cachedLazyItem, value, value) as T)
		: value;
	if (evaluatedSchema === undefined) {
		throw new UsageError(
			`Encountered an undefined schema. This could indicate that some referenced schema has not yet been instantiated.`,
		);
	}
	markSchemaMostDerived(evaluatedSchema);
	return evaluatedSchema;
}

/**
 * Indicates that a schema is the "most derived" version which is allowed to be used, see {@link MostDerivedData}.
 * Calling helps with error messages about invalid schema usage (using more than one type from single schema factor produced type,
 * and thus calling this for one than one subclass).
 * @remarks
 * Helper for invoking {@link TreeNodeValid.markMostDerived} for any {@link TreeNodeSchema} if it needed.
 */
export function markSchemaMostDerived(
	schema: TreeNodeSchema,
	oneTimeInitialize = false,
): void {
	if (schema instanceof LeafNodeSchema) {
		return;
	}

	if (!inPrototypeChain(schema, TreeNodeValid)) {
		// Use JSON.stringify to quote and escape identifier string.
		throw new UsageError(
			`Schema for ${JSON.stringify(
				schema.identifier,
			)} does not extend a SchemaFactory generated class. This is invalid.`,
		);
	}

	const schemaValid = schema as typeof TreeNodeValid & TreeNodeSchema;
	if (oneTimeInitialize) {
		schemaValid.oneTimeInitialize();
	} else {
		schemaValid.markMostDerived();
	}
}

/**
 * Types of {@link TreeNode|TreeNodes} or {@link TreeLeafValue|TreeLeafValues} allowed at a location in a tree.
 * @remarks
 * Used by {@link TreeViewConfiguration} for the root and various kinds of {@link TreeNodeSchema} to specify their allowed child types.
 *
 * Use {@link SchemaFactory} to access leaf schema or declare new composite schema.
 *
 * Implicitly treats a single type as an array of one type.
 *
 * Arrays of schema can be used to specify multiple types are allowed, which result in unions of those types in the Tree APIs.
 *
 * When saved into variables, avoid type-erasing the details, as doing so loses the compile time schema awareness of APIs derived from the types.
 *
 * When referring to types that are declared after the definition of the `ImplicitAllowedTypes`, the schema can be wrapped in a lambda to allow the forward reference.
 * See {@link ValidateRecursiveSchema} for details on how to structure the `ImplicitAllowedTypes` instances when constructing recursive schema.
 *
 * @example Explicit use with strong typing
 * ```typescript
 * const sf = new SchemaFactory("myScope");
 * const childTypes = [sf.number, sf.string] as const satisfies ImplicitAllowedTypes;
 * const config = new TreeViewConfiguration({ schema: childTypes });
 * ```
 *
 * @example Forward reference
 * ```typescript
 * const sf = new SchemaFactory("myScope");
 * class A extends sf.array("example", [() => B]) {}
 * class B extends sf.array("Inner", sf.number) {}
 * ```
 * @privateRemarks
 * Code reading data from this should use `normalizeAllowedTypes` to ensure consistent handling, caching, nice errors etc.
 * @public
 */
export type ImplicitAllowedTypes = AllowedTypes | TreeNodeSchema;

/**
 * Schema for a field of a tree node.
 * @remarks
 * Implicitly treats {@link ImplicitAllowedTypes} as a Required field of that type.
 * @public
 */
export type ImplicitFieldSchema = FieldSchema | ImplicitAllowedTypes;

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
	TSchema = [TSchemaInput] extends [CustomizedSchemaTyping<unknown, CustomTypes>]
		? TSchemaInput
		: SchemaUnionToIntersection<TSchemaInput>,
> = [TSchema] extends [FieldSchema<infer Kind, infer Types>]
	? ApplyKindInput<InsertableTreeNodeFromImplicitAllowedTypes<Types>, Kind, true>
	: [TSchema] extends [ImplicitAllowedTypes]
		? InsertableTreeNodeFromImplicitAllowedTypes<TSchema>
		: never;

/**
 * {@link UnionToIntersection} except it does not distribute over {@link CustomizedSchemaTyping}s when the original type is a union.
 * @privateRemarks
 * This is a workaround for TypeScript distributing over intersections over unions when distributing extends over unions.
 * @system @public
 */
export type SchemaUnionToIntersection<T> = [T] extends [
	CustomizedSchemaTyping<unknown, CustomTypes>,
]
	? T
	: UnionToIntersection<T>;

/**
 * {@inheritdoc (UnsafeUnknownSchema:type)}
 * @alpha
 */
export const UnsafeUnknownSchema: unique symbol = Symbol("UnsafeUnknownSchema");

/**
 * A special type which can be provided to some APIs as the schema type parameter when schema cannot easily be provided at compile time and an unsafe (instead of disabled) editing API is desired.
 * @remarks
 * When used, this means the TypeScript typing should err on the side of completeness (allow all inputs that could be valid).
 * This introduces the risk that out-of-schema data could be allowed at compile time, and only error at runtime.
 *
 * @privateRemarks
 * This only applies to APIs which input data which is expected to be in schema, since APIs outputting have easy mechanisms to do so in a type safe way even when the schema is unknown.
 * In most cases that amounts to returning `TreeNode | TreeLeafValue`.
 *
 * This can be contrasted with the default behavior of TypeScript, which is to require the intersection of the possible types for input APIs,
 * which for unknown schema defining input trees results in the `never` type.
 *
 * Any APIs which use this must produce UsageErrors when out of schema data is encountered, and never produce unrecoverable errors,
 * or silently accept invalid data.
 * This is currently only type exported from the package: the symbol is just used as a way to get a named type.
 *
 * TODO: This takes a very different approach than `customizeSchemaTyping` which applies to allowed types.
 * Maybe generalize that to apply to field schema as well and replace this with it?
 * @alpha
 */
export type UnsafeUnknownSchema = typeof UnsafeUnknownSchema;

/**
 * {@inheritdoc (CustomizedTyping:type)}
 * @system @public
 */
export const CustomizedTyping: unique symbol = Symbol("CustomizedTyping");

/**
 * A type brand used by {@link customizeSchemaTyping}.
 * @system @public
 */
export type CustomizedTyping = typeof CustomizedTyping;

/**
 * Collection of schema aware types.
 * @remarks
 * This type is only used as a type constraint.
 * It's fields are similar to an unordered set of generic type parameters.
 * {@link customizeSchemaTyping} applies this to {@link ImplicitAllowedTypes} via {@link CustomizedSchemaTyping}.
 * @sealed @public
 */
export interface CustomTypes {
	/**
	 * Type used for inserting values.
	 */
	readonly input: unknown;
	/**
	 * Type used for the read+write property on object nodes.
	 *
	 * Set to never to disable setter.
	 * @remarks
	 * Due to https://github.com/microsoft/TypeScript/issues/43826 we cannot set the desired setter type.
	 * Instead we can only control the types of the read+write property and the type of a readonly property.
	 *
	 * For recursive types using {@link SchemaFactory.objectRecursive}, support for using `never` to remove setters is limited:
	 * When the customized schema is wrapped in an {@link FieldSchema}, the setter will not be fully removed.
	 */
	readonly readWrite: TreeLeafValue | TreeNode;
	/**
	 * Type for reading data.
	 * @remarks
	 * See limitation for read+write properties on ObjectNodes in {@link CustomTypes.readWrite}.
	 */
	readonly output: TreeLeafValue | TreeNode;
}

/**
 * Type annotation which overrides the default schema derived types with customized ones.
 * @remarks
 * See {@link customizeSchemaTyping} for more information.
 * @system @public
 */
export type CustomizedSchemaTyping<TSchema, TCustom extends CustomTypes> = TSchema & {
	[CustomizedTyping]: TCustom;
};

/**
 * Default strict policy.
 *
 * @typeparam TSchema - The schema to process
 * @typeparam TInput - Internal: do not specify.
 * @typeparam TOutput - Internal: do not specify.
 * @remarks
 * Handles input types contravariantly so any input which might be invalid is rejected.
 * @sealed @public
 */
export interface StrictTypes<
	TSchema extends ImplicitAllowedTypes,
	TInput = DefaultInsertableTreeNodeFromImplicitAllowedTypes<TSchema>,
	TOutput extends TreeNode | TreeLeafValue = DefaultTreeNodeFromImplicitAllowedTypes<TSchema>,
> {
	input: TInput;
	readWrite: TInput extends never ? never : TOutput;
	output: TOutput;
}

/**
 * Customizes the types associated with `TSchema`
 * @remarks
 * By default, the types used when constructing, reading and writing tree nodes are derived from the schema.
 * In some cases, it may be desirable to override these types with carefully selected alternatives.
 * This utility allows for that customization.
 * Note that this customization is only used for typing, and does not affect the runtime behavior at all.
 *
 * This can be used for a wide variety of purposes, including (but not limited to):
 *
 * 1. Implementing better typing for a runtime extensible set of types (e.g. a polymorphic collection).
 * This is commonly needed when implementing containers which don't directly reference their child types, and can be done using {@link Customizer.simplified}.
 * 2. Adding type brands to specific values to increase type safety.
 * This can be done using {@link Customizer.simplified}.
 * 3. Adding some (compile time only) constraints to values, like enum style unions.
 * This can be done using {@link Customizer.simplified}.
 * 4. Making fields readonly (for the current client).
 * This can be done using {@link Customizer.custom} with `{ readWrite: never; }`.
 * 5. Opting into more [compleat and less sound](https://en.wikipedia.org/wiki/Soundness#Relation_to_completeness) typing.
 * {@link Customizer.relaxed} is an example of this.
 *
 * For this customization to be used, the resulting schema must be used as `ImplicitAllowedTypes`.
 * For example applying this to a single type, then using that type in an array of allowed types will have no effect:
 * in such a case the customization must instead be applied to the array of allowed types.
 * @privateRemarks
 * Once this API is more stable/final, the examples in tests such as openPolymorphism.spec.ts and schemaFactory.examples.spec.ts
 * should be copied into examples here, or somehow linked.
 * @alpha
 */
export function customizeSchemaTyping<const TSchema extends ImplicitAllowedTypes>(
	schema: TSchema,
): Customizer<TSchema> {
	// This function just does type branding, and duplicating the typing here to avoid any would just make it harder to maintain not easier:
	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	const f = (): any => schema;
	return { strict: f, relaxed: f, simplified: f, simplifiedUnrestricted: f, custom: f };
}

/**
 * Utility for customizing the types used for data matching a given schema.
 * @sealed @alpha
 */
export interface Customizer<TSchema extends ImplicitAllowedTypes> {
	/**
	 * The default {@link StrictTypes}, explicitly applied.
	 */
	strict(): CustomizedSchemaTyping<TSchema, StrictTypes<TSchema>>;
	/**
	 * Relaxed policy: allows possible invalid edits (which will err at runtime) when schema is not exact.
	 * @remarks
	 * Handles input types covariantly so any input which might be valid with the schema is allowed
	 * instead of the default strict policy of only inputs with all possible schema are allowed.
	 *
	 * This only modifies the typing shallowly: the typing of children are not effected.
	 */
	relaxed(): CustomizedSchemaTyping<
		TSchema,
		{
			input: TreeNodeSchema extends TSchema
				? InsertableContent
				: // This intentionally distributes unions over the conditional to get covariant type handling.
					TSchema extends TreeNodeSchema
					? InsertableTypedNode<TSchema>
					: // This intentionally distributes unions over the conditional to get covariant type handling.
						TSchema extends AllowedTypes
						? TSchema[number] extends LazyItem<infer TSchemaInner extends TreeNodeSchema>
							? InsertableTypedNode<TSchemaInner, TSchemaInner>
							: never
						: never;
			readWrite: TreeNodeFromImplicitAllowedTypes<TSchema>;
			output: TreeNodeFromImplicitAllowedTypes<TSchema>;
		}
	>;
	/**
	 * Replace typing with a single substitute which allowed types must implement.
	 * @remarks
	 * This is generally type safe for reading the tree, but allows instances of `T` other than those listed in the schema to be assigned,
	 * which can be out of schema and err at runtime in the same way {@link Customizer.relaxed} does.
	 * Until with {@link Customizer.relaxed}, implicit construction is disabled, meaning all nodes must be explicitly constructed (and thus implement `T`) before being inserted.
	 */
	simplified<T extends TreeNodeFromImplicitAllowedTypes<TSchema>>(): CustomizedSchemaTyping<
		TSchema,
		{
			input: T;
			readWrite: T;
			output: T;
		}
	>;

	/**
	 * The same as {@link Customizer} except that more T values are allowed, even ones not known to be implemented by `TSchema`.
	 */
	simplifiedUnrestricted<T extends TreeNode | TreeLeafValue>(): CustomizedSchemaTyping<
		TSchema,
		{
			input: T;
			readWrite: T;
			output: T;
		}
	>;

	/**
	 * Fully arbitrary customization.
	 * Provided types override existing types.
	 */
	custom<T extends Partial<CustomTypes>>(): CustomizedSchemaTyping<
		TSchema,
		{
			// Check if property is provided. This check is needed to early out missing values so if undefined is allowed,
			// not providing the field doesn't overwrite the corresponding type with undefined.
			// TODO: test this case
			[Property in keyof CustomTypes]: Property extends keyof T
				? T[Property] extends CustomTypes[Property]
					? T[Property]
					: GetTypes<TSchema>[Property]
				: GetTypes<TSchema>[Property];
		}
	>;
}

/**
 * Fetch types associated with a schema, or use the default if not customized.
 * @system @public
 */
export type GetTypes<TSchema extends ImplicitAllowedTypes> = [TSchema] extends [
	CustomizedSchemaTyping<unknown, infer TCustom>,
]
	? TCustom
	: StrictTypes<TSchema>;

/**
 * Content which could be inserted into a tree.
 *
 * @see {@link Input}
 * @remarks
 * Alias of {@link InsertableTreeNodeFromImplicitAllowedTypes} with a shorter name.
 * @alpha
 */
export type Insertable<TSchema extends ImplicitAllowedTypes> =
	InsertableTreeNodeFromImplicitAllowedTypes<TSchema>;

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

/**
 * Type of tree node for a field of the given schema.
 *
 * @typeparam TSchema - Schema to process.
 * @remarks
 * Defaults to {@link DefaultTreeNodeFromImplicitAllowedTypes}.
 * @public
 */
export type TreeNodeFromImplicitAllowedTypes<
	TSchema extends ImplicitAllowedTypes = TreeNodeSchema,
> = GetTypes<TSchema>["output"];

/**
 * Default type of tree node for a field of the given schema.
 * @system @public
 */
export type DefaultTreeNodeFromImplicitAllowedTypes<
	TSchema extends ImplicitAllowedTypes = TreeNodeSchema,
> = TSchema extends TreeNodeSchema
	? NodeFromSchema<TSchema>
	: TSchema extends AllowedTypes
		? NodeFromSchema<FlexListToUnion<TSchema>>
		: unknown;

/**
 * This type exists only to be linked from documentation to provide a single linkable place to document some details of
 * "Input" types and how they handle schema.
 *
 * When a schema is used to describe data which is an input into an API, the API is [contravariant](https://en.wikipedia.org/wiki/Covariance_and_contravariance_(computer_science)) over the schema.
 * (See also, [TypeScript Variance Annotations](https://www.typescriptlang.org/docs/handbook/2/generics.html#variance-annotations)).
 *
 * Since these schema are expressed using TypeScript types, it is possible for the user of the API to provide non-exact values of these types which has implications that depended on the variance.
 *
 * Consider a field with schema type of `A | B` (where A and B are types of schema).
 *
 * - Reading the field behaves covariantly so {@link NodeFromSchema} of `<A | B>` is the same as `NodeFromSchema<A> | NodeFromSchema<B>`, indicating that either type of node can be read from the field.
 * - Writing to the field behaves contravariantly. Since it is unknown if the node actually has a schema `A` or a schema `B`, the only legal values (known to be in schema regardless of which schema the underlying node has) are values which are legal for both `A & B`.
 *
 * Note that this is distinct from the case where the schema is `[A, B]`.
 * In this case it is known that the field allows both A and B (the field can be set to an A or a B value).
 * When `A | B` is used, the field might allow
 * A but not B (so assigning a B value would be out of schema),
 * B but not A (so assigning an A value would be out of schema)
 * or both A and B.
 *
 * This gets more extreme when given completely unspecified schema.
 * For example if a field is just provided {@link ImplicitFieldSchema}, nothing is known about the content of the field.
 * This means that reading the field (via {@link TreeFieldFromImplicitField}) can give any valid tree field content,
 * but there are no safe values which could be written to the field (since it is unknown what values would be out of schema) so {@link InsertableTreeFieldFromImplicitField} gives `never`.
 *
 * To implement this variance correctly, the computation of types for input and output have to use separate utilities
 * which take very different approaches when encountering non-exact schema like unions or `ImplicitFieldSchema`.
 * The utilities which behave contravariantly (as required to handle input correctly) link this documentation to indicate that this is how they behave.
 *
 * In addition to behaving contravariantly, these input type computation utilities often have further limitations.
 * This is due to TypeScript making it difficult to implement this contravariance exactly.
 * When faced with these implementation limitations these contravariant type computation utilities error on the side of producing overly strict requirements.
 * For example in the above case of `A | B`, the utilities might compute an allowed insertable type as `never` even if there happens to be a common value accepted by both `A` and `B`.
 * Future versions of the API can relax these requirements as the type computations are made more accurate.
 *
 * For a more concrete example: if {@link InsertableTreeFieldFromImplicitField} produced `never` for a schema `A | OptionalField<A>`,
 * a future version could instead return a more flexible but still safe type, like `A`.
 *
 * More generally: try to avoid providing non-exact schema, especially for the fields of other schema.
 * While these APIs attempt to handle such cases correctly, there are limitations and known bugs in this handling.
 * Code using non-exact schema is much more likely to have its compilation break due to updates of this package or even TypeScript,
 * and thus compilation breaks due to edge cases of non-exact schema handling, especially with recursive schema, are not considered breaking changes.
 * This may change as the API become more stable.
 *
 * @privateRemarks
 * There likely is a better way to share this documentation, but none was found at the time of writing.
 *
 * TODO: Once {@link InsertableField} is public, consider using it in the examples above.
 * @system @public
 */
export type Input<T extends never> = T;

/**
 * Type of content that can be inserted into the tree for a node of the given schema.
 *
 * @typeparam TSchema - Schema to process.
 * @remarks
 * Defaults to {@link DefaultInsertableTreeNodeFromImplicitAllowedTypes}.
 * @public
 */
export type InsertableTreeNodeFromImplicitAllowedTypes<TSchema extends ImplicitAllowedTypes> =
	GetTypes<TSchema>["input"];

/**
 * Type of content that can be inserted into the tree for a node of the given schema.
 *
 * @see {@link Input}
 *
 * @typeparam TSchema - Schema to process.
 *
 * @privateRemarks
 * This is a bit overly conservative, since cases like `A | [A]` give never and could give `A`.
 * @system @public
 */
export type DefaultInsertableTreeNodeFromImplicitAllowedTypes<
	TSchema extends ImplicitAllowedTypes,
> = [TSchema] extends [TreeNodeSchema]
	? InsertableTypedNode<TSchema>
	: [TSchema] extends [AllowedTypes]
		? InsertableTreeNodeFromAllowedTypes<TSchema>
		: never;

/**
 * Type of content that can be inserted into the tree for a node of the given schema.
 *
 * @see {@link Input}
 *
 * @typeparam TList - AllowedTypes to process
 * @system @public
 */
export type InsertableTreeNodeFromAllowedTypes<TList extends AllowedTypes> =
	TList extends readonly [
		LazyItem<infer TSchema extends TreeNodeSchema>,
		...infer Rest extends AllowedTypes,
	]
		? InsertableTypedNode<TSchema> | InsertableTreeNodeFromAllowedTypes<Rest>
		: never;

/**
 * Takes in `TreeNodeSchema[]` and returns a TypedNode union.
 * @privateRemarks
 * If a schema is both TreeNodeSchemaClass and TreeNodeSchemaNonClass, prefer TreeNodeSchemaClass since that includes subclasses properly.
 * @public
 */
export type NodeFromSchema<T extends TreeNodeSchema> = T extends TreeNodeSchemaClass<
	string,
	NodeKind,
	infer TNode
>
	? TNode
	: T extends TreeNodeSchemaNonClass<string, NodeKind, infer TNode>
		? TNode
		: never;

/**
 * Data which can be used as a node to be inserted.
 * Either an unhydrated node, or content to build a new node.
 *
 * @see {@link Input}
 *
 * @typeparam TSchemaInput - Schema to process.
 * @typeparam T - Do not specify: default value used as implementation detail.
 * @privateRemarks
 * This can't really be fully correct, since TreeNodeSchema's TNode is generally use covariantly but this code uses it contravariantly.
 * That makes this TreeNodeSchema actually invariant with respect to TNode, but doing that would break all `extends TreeNodeSchema` clauses.
 * As is, this works correctly in most realistic use-cases.
 *
 * One special case this makes is if the result of NodeFromSchema contains TreeNode, this must be an under constrained schema, so the result is set to never.
 * Note that applying UnionToIntersection on the result of NodeFromSchema<T> does not work since it breaks booleans.
 *
 * Some internal code may use second parameter to opt out of contravariant behavior, but this is not a stable API.
 *
 * @public
 */
export type InsertableTypedNode<
	TSchema extends TreeNodeSchema,
	T = UnionToIntersection<TSchema>,
> =
	| (T extends TreeNodeSchema<string, NodeKind, TreeNode | TreeLeafValue, never, true>
			? NodeBuilderData<T>
			: never)
	| (T extends TreeNodeSchema
			? Unhydrated<TreeNode extends NodeFromSchema<T> ? never : NodeFromSchema<T>>
			: never);

/**
 * Given a node's schema, return the corresponding object from which the node could be built.
 * @privateRemarks
 * This uses TreeNodeSchemaCore, and thus depends on TreeNodeSchemaCore.createFromInsertable for the typing.
 * This works almost the same as using TreeNodeSchema,
 * except that the more complex typing in TreeNodeSchema case breaks for non-class schema and leaks in `undefined` from optional crete parameters.
 * @system @public
 */
export type NodeBuilderData<T extends TreeNodeSchemaCore<string, NodeKind, boolean>> =
	T extends TreeNodeSchemaCore<string, NodeKind, boolean, unknown, infer TBuild>
		? TBuild
		: never;

/**
 * Value that may be stored as a leaf node.
 * @remarks
 * Some limitations apply, see the documentation for {@link schemaStatics.number} and {@link schemaStatics.string} for those restrictions.
 * @public
 */
// eslint-disable-next-line @rushstack/no-new-null
export type TreeLeafValue = number | string | boolean | IFluidHandle | null;

/**
 * Additional information to provide to Node Schema creation.
 *
 * @typeParam TCustomMetadata - Custom metadata properties to associate with the Node Schema.
 * See {@link NodeSchemaMetadata.custom}.
 *
 * @sealed
 * @public
 */
export interface NodeSchemaOptions<out TCustomMetadata = unknown> {
	/**
	 * Optional metadata to associate with the Node Schema.
	 *
	 * @remarks
	 * Note: this metadata is not persisted nor made part of the collaborative state; it is strictly client-local.
	 * Different clients in the same collaborative session may see different metadata for the same field.
	 */
	readonly metadata?: NodeSchemaMetadata<TCustomMetadata> | undefined;
}

/**
 * Metadata associated with a Node Schema.
 *
 * @remarks Specified via {@link NodeSchemaOptions.metadata}.
 *
 * @sealed
 * @public
 */
export interface NodeSchemaMetadata<out TCustomMetadata = unknown> {
	/**
	 * User-defined metadata.
	 */
	readonly custom?: TCustomMetadata | undefined;

	/**
	 * The description of the Node Schema.
	 *
	 * @remarks
	 *
	 * If provided, will be used by the system in scenarios where a description of the kind of node is useful.
	 * E.g., when converting a Node Schema to {@link https://json-schema.org/ | JSON Schema}, this description will be
	 * used as the `description` property.
	 */
	readonly description?: string | undefined;
}
