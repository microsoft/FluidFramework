/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { UsageError } from "@fluidframework/telemetry-utils/internal";
import { Lazy } from "@fluidframework/core-utils/internal";

import {
	type ErasedBaseType,
	ErasedTypeImplementation,
} from "@fluidframework/core-interfaces/internal";

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
import type { SimpleAllowedTypeAttributes } from "../simpleSchema.js";

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
 *
 * Due to one implementation of this being {@link AllowedTypesFull}, it is not safe to assume this is an array (as determined by `Array.isArray`).
 *
 * Code reading data from this should use {@link normalizeAllowedTypes} to ensure consistent handling, caching, nice errors etc.
 * @system @public
 */
export type AllowedTypes = readonly LazyItem<TreeNodeSchema>[];

/**
 * Stores annotations for an individual allowed type.
 * @remarks
 * Create using APIs on {@link SchemaStaticsBeta}, like {@link SchemaStaticsBeta.staged}.
 * @privateRemarks
 * Since this is sealed, users are not supposed to create instances of it directly.
 * Making it extend ErasedType could enforce that.
 * @beta
 * @sealed
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
 * {@link AllowedTypesFull} but with the lazy schema references eagerly evaluated.
 * @sealed
 * @beta
 */
export type AllowedTypesFullEvaluated = AllowedTypesFull<
	readonly AnnotatedAllowedType<TreeNodeSchema>[]
>;

/**
 * Checks if the input is an {@link AnnotatedAllowedTypes}.
 */
export function isAnnotatedAllowedTypes(
	allowedTypes: ImplicitAllowedTypes,
): allowedTypes is AllowedTypesFullInternal {
	checkForUninitializedSchema(allowedTypes);
	return allowedTypes instanceof AnnotatedAllowedTypesInternal;
}

/**
 * Stores annotations for a set of allowed types.
 * @beta
 * @sealed
 */
export interface AnnotatedAllowedTypes<T = readonly AnnotatedAllowedType[]>
	extends ErasedBaseType<"tree.AnnotatedAllowedTypes"> {
	/**
	 * Annotations that apply to a set of allowed types.
	 */
	readonly metadata: AllowedTypesMetadata;

	/**
	 * All the allowed types that the annotations apply to. The types themselves may also have individual annotations.
	 */
	readonly types: T;

	/**
	 * Get this {@link AnnotatedAllowedTypes} but with any lazy schema references eagerly evaluated.
	 * @remarks
	 * See {@link evaluateLazySchema} the implications of evaluating lazy schema references.
	 */
	evaluate(): AllowedTypesFullEvaluated;

	/**
	 * Get the allowed types as a set with any lazy schema references eagerly evaluated.
	 * @remarks
	 * See {@link evaluateLazySchema} the implications of evaluating lazy schema references.
	 */
	evaluateSet(): ReadonlySet<TreeNodeSchema>;

	/**
	 * Get the allowed types as a set of identifiers with any lazy schema references eagerly evaluated.
	 * @remarks
	 * See {@link evaluateLazySchema} the implications of evaluating lazy schema references.
	 *
	 * It is recommend to work in terms of {@link TreeNodeSchema}
	 * rather than identifiers where possible since its more type safe and it is possible that two schema with the same identifier exist.
	 */
	evaluateIdentifiers(): ReadonlySet<string>;
}

/**
 * Stores annotations for a set of allowed types.
 * @remarks
 * Most expressive form of AllowedTypes which any of the implicit types can be normalized to.
 * @beta
 * @sealed
 */
export type AllowedTypesFull<
	T extends readonly AnnotatedAllowedType[] = readonly AnnotatedAllowedType[],
> = AnnotatedAllowedTypes<T> & UnannotateAllowedTypesList<T>;

/**
 * Creates an {@link AllowedTypesFull} type from a mixed array of annotated and unannotated allowed types.
 * @system @sealed @beta
 */
export type AllowedTypesFullFromMixed<
	T extends readonly (AnnotatedAllowedType | LazyItem<TreeNodeSchema>)[],
> = UnannotateAllowedTypesList<T> & AnnotatedAllowedTypes<AnnotateAllowedTypesList<T>>;

/**
 * The same as the built-in InstanceType, but works on classes with private constructors.
 * @privateRemarks
 * This is based on the trick in {@link https://stackoverflow.com/a/74657881}.
 */
type InstanceTypeRelaxed<TClass> = InstanceType<(new () => never) & TClass>;

/**
 * {@link AllowedTypesFull} but with internal types.
 */
export type AllowedTypesFullInternal<
	T extends readonly AnnotatedAllowedType[] = readonly AnnotatedAllowedType[],
> = AnnotatedAllowedTypesInternal<T> & UnannotateAllowedTypesList<T>;

type AllowedTypesFullInternalEvaluated = AllowedTypesFullInternal<
	readonly AnnotatedAllowedType<TreeNodeSchema>[]
>;

/**
 * The implementation of {@link AnnotatedAllowedTypes}. Also implements {@link AllowedTypesFull}.
 * @remarks
 * Due to TypeScript limitations, this class cannot directly state it implements {@link AllowedTypesFull}.
 * As a workaround for that, the static `create` method returns the intersection type.
 */
export class AnnotatedAllowedTypesInternal<
		T extends readonly AnnotatedAllowedType[] = readonly AnnotatedAllowedType[],
	>
	extends ErasedTypeImplementation<AnnotatedAllowedTypes<T>>
	implements AnnotatedAllowedTypes<T>
{
	public readonly unannotatedTypes: UnannotateAllowedTypesList<T>;

	/**
	 * True if and only if there is at least one lazy schema reference in the types arrays.
	 */
	private readonly isLazy: boolean;

	private readonly lazyEvaluate: Lazy<{
		readonly annotated: AllowedTypesFullInternalEvaluated;
		readonly set: ReadonlySet<TreeNodeSchema>;
		readonly identifiers: ReadonlySet<string>;
	}>;

	private constructor(
		public readonly types: T,
		public readonly metadata: AllowedTypesMetadata = {},
	) {
		super();
		this.unannotatedTypes = types.map((type) => type.type) as typeof this.unannotatedTypes;

		// Since the array has been copied, mutations to it will not be handled correctly so freeze it.
		// Support for such mutations could be added at a later date by making more things lazy.
		Object.freeze(this.types);
		Object.freeze(this.unannotatedTypes);

		this.isLazy = false;
		for (const type of this.unannotatedTypes) {
			if (isLazy(type)) {
				this.isLazy = true;
			} else {
				markSchemaMostDerived(type);
			}
		}

		const proxy = AnnotatedAllowedTypesInternal.proxy(this);

		this.lazyEvaluate = new Lazy(() => {
			const annotated = this.isLazy
				? AnnotatedAllowedTypesInternal.create(
						this.types.map((type) => ({
							...type,
							type: evaluateLazySchema(type.type),
						})),
						this.metadata,
					)
				: (proxy as AllowedTypesFullInternalEvaluated);
			return {
				annotated,
				set: new Set(annotated.unannotatedTypes),
				identifiers: new Set(annotated.unannotatedTypes.map((t) => t.identifier)),
			};
		});

		return proxy;
	}

	public evaluate(): AllowedTypesFullInternalEvaluated {
		return this.lazyEvaluate.value.annotated;
	}

	public evaluateSet(): ReadonlySet<TreeNodeSchema> {
		return this.lazyEvaluate.value.set;
	}

	public evaluateIdentifiers(): ReadonlySet<string> {
		return this.lazyEvaluate.value.identifiers;
	}

	/**
	 * Get the {@link SimpleAllowedTypeAttributes} version of the allowed types set.
	 */
	public static evaluateSimpleAllowedTypes(
		annotatedAllowedTypes: AnnotatedAllowedTypes,
	): ReadonlyMap<string, SimpleAllowedTypeAttributes> {
		const simpleAllowedTypes = new Map<string, SimpleAllowedTypeAttributes>();
		for (const type of annotatedAllowedTypes.evaluate().types) {
			simpleAllowedTypes.set(type.type.identifier, {
				isStaged: type.metadata.stagedSchemaUpgrade !== undefined,
			});
		}
		return simpleAllowedTypes;
	}

	public static override [Symbol.hasInstance]<TThis extends { prototype: object }>(
		this: TThis,
		value: unknown,
	): value is InstanceTypeRelaxed<TThis> & AnnotatedAllowedTypesInternal & AllowedTypesFull {
		return ErasedTypeImplementation[Symbol.hasInstance].call(this, value);
	}

	public static override narrow<TThis extends { prototype: object }>(
		this: TThis,
		value: ErasedBaseType | InstanceTypeRelaxed<TThis> | ImplicitAllowedTypes,
	): asserts value is InstanceTypeRelaxed<TThis> &
		AnnotatedAllowedTypesInternal &
		AllowedTypesFull {
		if (!ErasedTypeImplementation[Symbol.hasInstance].call(this, value)) {
			throw new TypeError("Invalid AnnotatedAllowedTypes instance");
		}
	}

	private static proxy<const T extends readonly AnnotatedAllowedType[]>(
		result: AnnotatedAllowedTypesInternal<T>,
	): AnnotatedAllowedTypesInternal<T> & AllowedTypesFull<T> {
		const proxy = new Proxy(result, {
			set: () => {
				throw new UsageError("AnnotatedAllowedTypes is immutable");
			},

			get: (target, property, receiver) => {
				// Hide common array editing methods.
				if (property === "push" || property === "pop") {
					return undefined;
				}

				// Forward array lookup and array methods to the unannotated types array.
				if (property in target.unannotatedTypes) {
					return Reflect.get(target.unannotatedTypes, property);
				}
				// Forward anything else to target.
				return Reflect.get(target, property) as unknown;
			},

			has: (target, property) => {
				if (property in target.unannotatedTypes) {
					return true;
				}
				// Forward anything else to target.
				return property in target;
			},

			ownKeys: (target) => {
				const targetKeys = Reflect.ownKeys(target);
				const unannotatedTypesKeys = Reflect.ownKeys(target.unannotatedTypes);
				return [...unannotatedTypesKeys, ...targetKeys];
			},

			getOwnPropertyDescriptor: (target, property) => {
				if (Object.prototype.hasOwnProperty.call(target.unannotatedTypes, property)) {
					const inner = Object.getOwnPropertyDescriptor(target.unannotatedTypes, property);
					return {
						...inner,
						// Since these properties are not on the target, make them non-configurable to confirm with proxy invariants.
						configurable: true,
						writable: false,
					};
				} else {
					const inner = Object.getOwnPropertyDescriptor(target, property);
					return {
						...inner,
						writable: false,
						// Allow only array entries to be enumerable.
						enumerable: false,
					};
				}
			},
		});
		return proxy as typeof result & UnannotateAllowedTypesList<T>;
	}

	public static create<const T extends readonly AnnotatedAllowedType[]>(
		types: T,
		metadata: AllowedTypesMetadata = {},
	): AnnotatedAllowedTypesInternal<Readonly<T>> & AllowedTypesFull<Readonly<T>> {
		const result = new AnnotatedAllowedTypesInternal(types, metadata);
		return result as typeof result & UnannotateAllowedTypesList<T>;
	}

	public static createUnannotated<const T extends AllowedTypes>(
		types: T,
		metadata: AllowedTypesMetadata = {},
	): AnnotatedAllowedTypesInternal & Readonly<T> {
		Object.freeze(types);
		const annotatedTypes: AnnotatedAllowedType[] = types.map(normalizeToAnnotatedAllowedType);
		const result = AnnotatedAllowedTypesInternal.create(annotatedTypes, metadata);
		return result as typeof result & T;
	}

	public static createMixed<
		const T extends readonly (AnnotatedAllowedType | LazyItem<TreeNodeSchema>)[],
	>(types: T, metadata: AllowedTypesMetadata = {}): AllowedTypesFullFromMixed<T> {
		Object.freeze(types);
		const annotatedTypes: AnnotatedAllowedType[] = types.map(normalizeToAnnotatedAllowedType);
		const result = AnnotatedAllowedTypesInternal.create(annotatedTypes, metadata);
		return result as AllowedTypesFullFromMixed<T>;
	}
}

/**
 * Annotations that apply to a set of allowed types.
 * @remarks
 * Additional optionals may be added to this as non-breaking changes, so implementations of it should be simple object literals with no unlisted members.
 * @beta
 * @input
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
	checkForUninitializedSchema(allowedType);
	// Class based schema, and lazy schema references report type "function": filtering them out with typeof makes narrowing based on members mostly safe
	return typeof allowedType === "object" && "metadata" in allowedType && "type" in allowedType;
}

/**
 * Annotations that apply to an individual allowed type.
 * @remarks
 * Additional optionals may be added to this as non-breaking changes, so implementations of it should be simple object literals with no unlisted members.
 * @beta
 * @input
 */
export interface AllowedTypeMetadata {
	/**
	 * User defined metadata
	 */
	readonly custom?: unknown;

	/**
	 * If defined, indicates that an allowed type is {@link SchemaStaticsBeta.staged | staged}.
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
 * Create using {@link SchemaStaticsBeta.staged}.
 * @privateRemarks
 * TODO:#38722 implement runtime schema upgrades.
 * Until then, the class purely behaves mostly as a placeholder.
 * TODO: Consider allowing users to store a name for the upgrade to use in error messages.
 * @sealed @beta
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
 * Code reading data from this should use {@link normalizeAllowedTypes} to ensure consistent handling, caching, nice errors etc.
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
 * @public
 */
export type ImplicitAllowedTypes = AllowedTypes | TreeNodeSchema;

/**
 * Removes annotations from a list of allowed types that may contain annotations.
 * @system @beta
 */
export type UnannotateAllowedTypesList<
	T extends readonly (AnnotatedAllowedType | LazyItem<TreeNodeSchema>)[],
> = {
	[I in keyof T]: T[I] extends AnnotatedAllowedType<infer X> ? X : T[I];
};

/**
 * Add annotations to a list of allowed types that may or may not contain annotations.
 * @system @beta
 */
export type AnnotateAllowedTypesList<
	T extends readonly (AnnotatedAllowedType | LazyItem<TreeNodeSchema>)[],
> = {
	[I in keyof T]: T[I] extends AnnotatedAllowedType<unknown>
		? T[I]
		: AnnotatedAllowedType<T[I]>;
};

/**
 * Normalizes an {@link ImplicitAllowedTypes} to an {@link AllowedTypesFull}.
 * @alpha
 */
export function normalizeAllowedTypes(types: ImplicitAllowedTypes): AllowedTypesFull {
	return normalizeAllowedTypesInternal(types);
}

/**
 * Normalizes an allowed type to an {@link AnnotatedAllowedType}, by adding empty annotations if they don't already exist.
 */
export function normalizeToAnnotatedAllowedType<T extends LazyItem<TreeNodeSchema>>(
	type: T | AnnotatedAllowedType<T>,
): AnnotatedAllowedType<T> {
	return isAnnotatedAllowedType(type)
		? type
		: {
				metadata: {},
				type,
			};
}

/**
 * See note inside {@link normalizeAllowedTypesInternal}.
 */
const cachedNormalize = new WeakMap<ImplicitAllowedTypes, AllowedTypesFullInternal>();

/**
 * Normalizes allowed types to an {@link AllowedTypesFullInternal}.
 */
export function normalizeAllowedTypesInternal(
	type: ImplicitAllowedTypes,
): AllowedTypesFullInternal {
	if (isAnnotatedAllowedTypes(type)) {
		return type;
	}

	// This caching accomplishes two things:
	// 1. It avoids redundant computations for the same input.
	// 2. It provides a stable object identity for the output in case the input is normalized twice and other systems (such as unhydrated contexts) are cached based on the object identity of the output.
	// It is this second case which is the more important since creating the AnnotatedAllowedTypesInternal is rather cheap.
	// Adding this cache improved the performance of the "large recursive union" test (which mostly just constructs a TreeConfiguration) by ~5 times.
	// This cache is strictly a performance optimization: it is not required for correctness.
	return getOrCreate(cachedNormalize, type, () => {
		const inputArray = isReadonlyArray(type) ? type : [type];
		Object.freeze(inputArray);
		const annotatedTypes: AnnotatedAllowedType[] = inputArray.map(
			normalizeToAnnotatedAllowedType,
		);

		return AnnotatedAllowedTypesInternal.create(annotatedTypes);
	});
}

/**
 * Normalizes an {@link ImplicitAllowedTypes} to an {@link AllowedTypesFullInternalEvaluated} by eagerly evaluating any
 * lazy schema declarations and adding empty metadata if it doesn't already exist.
 *
 * @remarks Note: this must only be called after all required schemas have been declared, otherwise evaluation of
 * recursive schemas may fail.
 */
export function normalizeAndEvaluateAnnotatedAllowedTypes(
	types: ImplicitAllowedTypes,
): AllowedTypesFullInternalEvaluated {
	return normalizeAllowedTypesInternal(types).evaluate();
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

	checkForUninitializedSchema(evaluatedSchema);
	markSchemaMostDerived(evaluatedSchema);
	return evaluatedSchema;
}

/**
 * Throws a UsageError if the provided schema is undefined, most likely due to being used before it was initialized.
 */
export function checkForUninitializedSchema(
	schema: ImplicitAllowedTypes | LazyItem<TreeNodeSchema> | AnnotatedAllowedType,
): void {
	if (schema === undefined) {
		throw new UsageError(
			`Encountered an undefined schema. This could indicate that some referenced schema has not yet been instantiated. Consider using a lazy schema reference (like "() => schema") or delaying the evaluation of the lazy reference if one is already being used.`,
		);
	}
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
 * When a schema is used to describe data which is an input into an API, the API is {@link https://en.wikipedia.org/wiki/Type_variance | contravariant}) over the schema.
 * (See also {@link https://www.typescriptlang.org/docs/handbook/2/generics.html#variance-annotations | TypeScript Variance Annotations}).
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
 * This loop is non-recursive to allow larger unions before hitting the recursion limit in TypeScript.
 * @system @public
 */
export type InsertableTreeNodeFromAllowedTypes<TList extends AllowedTypes> =
	IsUnion<TList> extends true
		? never
		: {
				readonly [Property in keyof TList]: [TList[Property]] extends [
					LazyItem<infer TSchema extends TreeNodeSchema>,
				]
					? InsertableTypedNode<TSchema>
					: never;
			}[NumberKeys<TList>];

/**
 * Extracts the keys of `T` which are numbers.
 * @remarks
 * The keys are extracted as strings which can be used to index `T`.
 *
 * This handles cases like `{ x: 4 } & [5, 6]` returning `"0"` and `"1"`.
 * Such cases are difficult to handle since `keyof` includes `number` in such cases, but the type can not be indexed by `number`.
 * @system @public
 */
export type NumberKeys<
	T,
	Transformed = {
		readonly [Property in keyof T as number extends Property ? never : Property]: Property;
	},
> = Transformed[`${number}` & keyof Transformed];
