/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { UsageError } from "@fluidframework/telemetry-utils/internal";

import {
	getOrCreate,
	isReadonlyArray,
	type IsUnion,
	type MakeNominal,
} from "../../util/index.js";
import { isLazy, type FlexListToUnion, type LazyItem } from "./flexList.js";
import {
	NodeKind,
	type InsertableTypedNode,
	type NodeFromSchema,
	type TreeNodeSchema,
} from "./treeNodeSchema.js";
import { schemaAsTreeNodeValid } from "./treeNodeValid.js";

/**
 * Schema for types allowed in some location in a tree (like a field, map entry or array).
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
 * Duplicate entries in this array are not allowed and will produce runtime errors.
 * Duplicate types are allowed,
 * but this must only be reflected in the type and not the runtime values.
 * This duplication can be used to encode the typing when the number of items in the array is not known at compile time
 * but some of the items are known to be present unconditionally.
 * For example, typing `[typeof A] | [typeof A, typeof B]` as `[typeof A, typeof B | typeof A]` is allowed,
 * and can produce more useful {@link Input} types.
 * @privateRemarks
 * Code reading data from this should use `normalizeAllowedTypes` to ensure consistent handling, caching, nice errors etc.
 * @system @public
 */
export type AllowedTypes = readonly LazyItem<TreeNodeSchema>[];

/**
 * Stores annotations for an individual allowed type.
 * @alpha
 */
export interface AnnotatedAllowedType<T = LazyItem<TreeNodeSchema>> {
	/**
	 * Annotations for the allowed type.
	 */
	readonly metadata: AllowedTypeMetadata;
	/**
	 * The allowed type the annotations apply to in a particular schema.
	 */
	readonly type: T;
}

/**
 * Stores annotations for a set of evaluated annotated allowed types.
 * @alpha
 */
export interface NormalizedAnnotatedAllowedTypes {
	/**
	 * Annotations that apply to a set of allowed types.
	 */
	readonly metadata: AllowedTypesMetadata;
	/**
	 * All the evaluated allowed types that the annotations apply to. The types themselves are also individually annotated.
	 */
	readonly types: readonly AnnotatedAllowedType<TreeNodeSchema>[];
}

/**
 * Checks if the input is an {@link AnnotatedAllowedTypes}.
 */
export function isAnnotatedAllowedTypes(
	allowedTypes: ImplicitAnnotatedAllowedTypes,
): allowedTypes is AnnotatedAllowedTypes {
	return (
		// Class based schema, and lazy schema references report type "function": filtering them out with typeof makes narrowing based on members mostly safe
		typeof allowedTypes === "object" && "metadata" in allowedTypes && "types" in allowedTypes
	);
}

/**
 * Stores annotations for a set of allowed types.
 * @alpha
 */
export interface AnnotatedAllowedTypes {
	/**
	 * Annotations that apply to a set of allowed types.
	 */
	readonly metadata: AllowedTypesMetadata;
	/**
	 * All the allowed types that the annotations apply to. The types themselves may also have individual annotations.
	 */
	readonly types: readonly (AnnotatedAllowedType | LazyItem<TreeNodeSchema>)[];
}

/**
 * Annotations that apply to a set of allowed types.
 * @remarks
 * Additional optionals may be added to this as non-breaking changes, so implementations of it should be simple object literals with no unlisted members.
 * @alpha
 */
export interface AllowedTypesMetadata {
	/**
	 * User defined metadata
	 */
	readonly custom?: unknown;
}

/**
 * Checks if the given allowed type is annotated with {@link AllowedTypeMetadata}.
 */
export function isAnnotatedAllowedType(
	allowedType: AnnotatedAllowedType | LazyItem<TreeNodeSchema>,
): allowedType is AnnotatedAllowedType {
	return "metadata" in allowedType && "type" in allowedType;
}

/**
 * Annotations that apply to an individual allowed type.
 * @remarks
 * Additional optionals may be added to this as non-breaking changes, so implementations of it should be simple object literals with no unlisted members.
 * @alpha
 */
export interface AllowedTypeMetadata {
	/**
	 * User defined metadata
	 */
	readonly custom?: unknown;

	/**
	 * If defined, indicates that an allowed type is {@link SchemaFactoryAlpha.staged | staged}.
	 */
	readonly stagedSchemaUpgrade?: SchemaUpgrade;
}

/**
 * Package internal {@link SchemaUpgrade} construction API.
 */
export let createSchemaUpgrade: () => SchemaUpgrade;

/**
 * Unique token used to upgrade schemas and determine if a particular upgrade has been completed.
 * @remarks
 * Create using {@link SchemaFactoryAlpha.staged}.
 * @privateRemarks
 * TODO:#38722 implement runtime schema upgrades until then, the class purely behaves as a placeholder.
 * TODO: Consider allowing users to store a name for the upgrade to use in error messages.
 * @sealed @alpha
 */
export class SchemaUpgrade {
	protected _typeCheck!: MakeNominal;
	static {
		createSchemaUpgrade = () => new SchemaUpgrade();
	}

	private constructor() {}
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
 * Types of {@link TreeNode|TreeNodes} or {@link TreeLeafValue|TreeLeafValues} allowed at a location in a tree with
 * additional metadata associated with the location they're allowed at.
 * @alpha
 */
export type ImplicitAnnotatedAllowedTypes =
	| TreeNodeSchema
	| AnnotatedAllowedType
	| AnnotatedAllowedTypes
	| readonly (AnnotatedAllowedType | LazyItem<TreeNodeSchema>)[];

/**
 * Returns an {@link ImplicitAllowedTypes} that is equivalent to the input without annotations.
 * @system @alpha
 */
export type UnannotateImplicitAllowedTypes<T extends ImplicitAnnotatedAllowedTypes> =
	T extends AnnotatedAllowedTypes
		? UnannotateAllowedTypes<T>
		: T extends AnnotatedAllowedType
			? UnannotateAllowedType<T>
			: T extends readonly (AnnotatedAllowedType | LazyItem<TreeNodeSchema>)[]
				? UnannotateAllowedTypesList<T>
				: T extends TreeNodeSchema
					? T
					: never;

/**
 * Removes annotations from a list of allowed types that may contain annotations.
 * @system @alpha
 */
export type UnannotateAllowedTypesList<
	T extends readonly (AnnotatedAllowedType | LazyItem<TreeNodeSchema>)[],
> = {
	[I in keyof T]: UnannotateAllowedTypeOrLazyItem<T[I]>;
};

/**
 * Removes annotations from an allowed type that may contain annotations.
 * @system @alpha
 */
export type UnannotateAllowedTypeOrLazyItem<
	T extends AnnotatedAllowedType | LazyItem<TreeNodeSchema>,
> = T extends AnnotatedAllowedType<infer X> ? X : T;

/**
 * Removes all annotations from a set of allowed types.
 * @system @alpha
 */
export type UnannotateAllowedTypes<T extends AnnotatedAllowedTypes> =
	UnannotateAllowedTypesList<T["types"]>;

/**
 * Removes annotations from an allowed type.
 * @system @alpha
 */
export type UnannotateAllowedType<T extends AnnotatedAllowedType> =
	T extends AnnotatedAllowedType<infer X> ? [X] : T;

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
	types: ImplicitAnnotatedAllowedTypes,
): ReadonlySet<TreeNodeSchema> {
	// remove annotations before normalizing
	const unannotated = unannotateImplicitAllowedTypes(types);
	const normalized = new Set<TreeNodeSchema>();
	if (isReadonlyArray(unannotated)) {
		// Types array must not be modified after it is normalized since that would result in the user of the normalized data having wrong (out of date) content.
		Object.freeze(unannotated);
		for (const lazyType of unannotated) {
			normalized.add(evaluateLazySchema(lazyType));
		}
	} else {
		normalized.add(evaluateLazySchema(unannotated));
	}
	return normalized;
}

/**
 * Normalizes an allowed type to an {@link AnnotatedAllowedType}, by adding empty annotations if they don't already exist
 * and eagerly evaluating any lazy schema declarations.
 *
 * @remarks
 * Note: this must only be called after all required schemas have been declared, otherwise evaluation of
 * recursive schemas may fail.
 * type is frozen and should not be modified after being passed in.
 */
export function normalizeToAnnotatedAllowedType<T extends TreeNodeSchema>(
	type: T | AnnotatedAllowedType<T> | AnnotatedAllowedType<LazyItem<T>>,
): AnnotatedAllowedType<T> {
	return isAnnotatedAllowedType(type)
		? {
				metadata: type.metadata,
				type: evaluateLazySchema(type.type),
			}
		: {
				metadata: {},
				type,
			};
}

/**
 * Normalizes a {@link ImplicitAnnotatedAllowedTypes} to a set of {@link AnnotatedAllowedSchema}s, by eagerly evaluating any
 * lazy schema declarations and adding empty metadata if it doesn't already exist.
 *
 * @remarks Note: this must only be called after all required schemas have been declared, otherwise evaluation of
 * recursive schemas may fail.
 */
export function normalizeAnnotatedAllowedTypes(
	types: ImplicitAnnotatedAllowedTypes,
): NormalizedAnnotatedAllowedTypes {
	const typesWithoutAnnotation = isAnnotatedAllowedTypes(types) ? types.types : types;
	const annotatedTypes: AnnotatedAllowedType<TreeNodeSchema>[] = [];
	if (isReadonlyArray(typesWithoutAnnotation)) {
		for (const annotatedType of typesWithoutAnnotation) {
			if (isAnnotatedAllowedType(annotatedType)) {
				annotatedTypes.push({
					type: evaluateLazySchema(annotatedType.type),
					metadata: annotatedType.metadata,
				});
			} else {
				annotatedTypes.push({ type: evaluateLazySchema(annotatedType), metadata: {} });
			}
		}
	} else {
		if (isAnnotatedAllowedType(typesWithoutAnnotation)) {
			annotatedTypes.push({
				type: evaluateLazySchema(typesWithoutAnnotation.type),
				metadata: typesWithoutAnnotation.metadata,
			});
		} else {
			annotatedTypes.push({ type: evaluateLazySchema(typesWithoutAnnotation), metadata: {} });
		}
	}

	return {
		metadata: isAnnotatedAllowedTypes(types) ? types.metadata : {},
		types: annotatedTypes,
	};
}

/**
 * Converts an {@link ImplicitAnnotatedAllowedTypes} to an {@link ImplicitAllowedTypes}s, by removing
 * any annotations.
 * @remarks
 * This does not evaluate any lazy schemas.
 */
export function unannotateImplicitAllowedTypes<Types extends ImplicitAnnotatedAllowedTypes>(
	types: Types,
): UnannotateImplicitAllowedTypes<Types> {
	return (
		isAnnotatedAllowedTypes(types)
			? types.types.map((allowedType) =>
					isAnnotatedAllowedType(allowedType) ? allowedType.type : allowedType,
				)
			: isReadonlyArray(types)
				? types.map((allowedType) =>
						isAnnotatedAllowedType(allowedType) ? allowedType.type : allowedType,
					)
				: isAnnotatedAllowedType(types)
					? (types.type as UnannotateImplicitAllowedTypes<Types>)
					: types
	) as UnannotateImplicitAllowedTypes<Types>;
}

const cachedLazyItem = new WeakMap<() => unknown, unknown>();

/**
 * Returns the schema referenced by the {@link LazyItem}.
 * @remarks
 * Caches results to handle {@link LazyItem}s which compute their resulting schema.
 * @alpha
 */
export function evaluateLazySchema<T extends TreeNodeSchema>(value: LazyItem<T>): T {
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
 * Indicates that the provided schema is the "most derived" version in its class hierarchy.
 *
 * @param oneTimeInitialize - If true this runs {@link TreeNodeValid.oneTimeInitialize} which does even more initialization and validation.
 * `oneTimeInitialize` can't safely be run until all transitively referenced schema are defined, so which cases can safely use it are more limited.
 * When legal for the caller to set this to true, it is preferred, but it is often not safe due to possible forward references.
 * @remarks
 * See {@link MostDerivedData} and {@link SchemaFactory} for details on what a "most derived" schema is and why it matters.
 *
 * This is a helper for invoking {@link TreeNodeValid.markMostDerived} for {@link TreeNodeSchema}.
 *
 * Calling this helps with error messages about invalid schema usage (See {@link SchemaFactory} for the rules, some of which this helps validate).
 * Typically this should be called for each schema as early as practical to improve error reporting for invalid usages of schema
 * (using two different schema derived from the same {@link SchemaFactory} produced base class).
 *
 * Note that construction of actual {@link TreeNode} instances or use of a schema transitively in a {@link TreeViewConfiguration} already do this,
 * so any calls to this that is unconditionally after that point for the given schema is not needed.
 * Instead most usages of this should be from those cases, and from miscellaneous cases where a schema is passed into an public API where theoretically someone could accidentally
 * pass in a base class of a schema instead of the most derived one.
 */
export function markSchemaMostDerived(
	schema: TreeNodeSchema,
	oneTimeInitialize = false,
): void {
	// Leaf schema are not classes, and thus do not need to be marked as most derived.
	if (schema.kind === NodeKind.Leaf) {
		return;
	}

	const schemaValid = schemaAsTreeNodeValid(schema);

	if (oneTimeInitialize) {
		schemaValid.oneTimeInitialize();
	} else {
		schemaValid.markMostDerived();
	}
}

/**
 * Type of tree node for a field of the given schema.
 * @public
 */
export type TreeNodeFromImplicitAllowedTypes<
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
 *
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
 * @see {@link Input}
 *
 * @typeparam TSchema - Schema to process.
 *
 * @privateRemarks
 * This is a bit overly conservative, since cases like `A | [A]` give never and could give `A`.
 * @public
 */
export type InsertableTreeNodeFromImplicitAllowedTypes<TSchema extends ImplicitAllowedTypes> =
	[TSchema] extends [TreeNodeSchema]
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
 *
 * @privateRemarks
 * This loop is manually unrolled to allow larger unions before hitting the recursion limit in TypeScript.
 * @system @public
 */
export type InsertableTreeNodeFromAllowedTypes<TList extends AllowedTypes> =
	IsUnion<TList> extends true
		? never
		: {
				readonly [Property in keyof TList]: TList[Property] extends LazyItem<
					infer TSchema extends TreeNodeSchema
				>
					? InsertableTypedNode<TSchema>
					: never;
			}[number];
