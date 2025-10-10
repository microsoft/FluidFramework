/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import type {
	IsUnion,
	RestrictiveStringRecord,
	UnionToIntersection,
} from "../../util/index.js";

import type {
	ApplyKind,
	ApplyKindInput,
	FieldKind,
	FieldSchema,
	FieldSchemaAlpha,
} from "../fieldSchema.js";
import type {
	NodeKind,
	WithType,
	TreeNode,
	Unhydrated,
	InternalTreeNode,
	TreeNodeSchema,
	TreeNodeSchemaCore,
	TreeNodeSchemaClass,
	ImplicitAllowedTypes,
	TreeLeafValue,
	FlexListToUnion,
	LazyItem,
	AnnotatedAllowedType,
	AnnotatedAllowedTypes,
} from "../core/index.js";
import type { ApplyKindAssignment, TreeArrayNode } from "../node-kinds/index.js";
import type { SimpleArrayNodeSchema, SimpleMapNodeSchema } from "../simpleSchema.js";
import type { CustomizedSchemaTyping, CustomTypes } from "../schemaTypes.js";

/*
 * TODO:
 * Below are a bunch of "unsafe" versions of types from "schemaTypes.ts".
 * These types duplicate the ones in "schemaTypes.ts", except with some of the extends clauses unenforced.
 * This is not great for type safety or maintainability.
 * Eventually it would be great to do at least one of the following:
 * 1. Find a way to avoid needing these entirely, possibly by improving TSC's recursive type support.
 * 2. Deduplicate the safe and unsafe types (possibly by having the safe one call the unsafe ones, or some other trick).
 * 3. Add type tests that check that the two copies of these types produce identical results.
 */
/* eslint-disable @typescript-eslint/no-explicit-any */

/**
 * A placeholder to use in {@link https://www.typescriptlang.org/docs/handbook/2/generics.html#generic-constraints | extends constraints} when using the real type breaks compilation of some recursive types due to {@link https://github.com/microsoft/TypeScript/issues/55758 | a design limitation of TypeScript}.
 *
 * These extends constraints only serve as documentation:
 * to avoid breaking compilation, this type has to not actually enforce anything, and thus is just `unknown`.
 * Therefore the type safety is the responsibility of the user of the API.
 * @public
 */
export type Unenforced<_DesiredExtendsConstraint> = unknown;

/**
 * {@link Unenforced} version of {@link customizeSchemaTyping} for use with recursive schema types.
 *
 * @remarks
 * When using this API to modify a schema derived type such that the type is no longer recursive,
 * or uses an externally defined type (which can be recursive), {@link customizeSchemaTyping} should be used instead for an improved developer experience.
 * Additionally, in this case, none of the "unsafe" type variants should be needed: the whole schema (with runtime but not schema derived type recursion)
 * should use the normal (not unsafe/recursive) APIs.
 * @alpha
 */
export function customizeSchemaTypingUnsafe<
	TSchema extends System_Unsafe.ImplicitAllowedTypesUnsafe,
>(schema: TSchema): System_Unsafe.CustomizerUnsafe<TSchema> {
	// This function just does type branding, and duplicating the typing here to avoid any would just make it harder to maintain not easier:
	const f = (): any => schema;
	return { simplified: f, simplifiedUnrestricted: f, custom: f };
}

/**
 * A collection of {@link Unenforced} types that are used in the implementation of recursive schema.
 * These are all `@system` types, and thus should not be used directly.
 * @privateRemarks
 * Due to limitations of API-Extractor, all types in this namespace are treated as `@public`:
 * therefore, non-public types should not be included in this namespace.
 * @system @public
 */
export namespace System_Unsafe {
	/**
	 * {@link Unenforced} version of `Customizer`.
	 * @remarks
	 * This has fewer options than the safe version, but all options can still be expressed using the "custom" method.
	 * @sealed @public
	 */
	export interface CustomizerUnsafe<TSchema extends ImplicitAllowedTypesUnsafe> {
		/**
		 * Replace typing with a single substitute type which allowed types must implement.
		 * @remarks
		 * This is generally type safe for reading the tree, but allows instances of `T` other than those listed in the schema to be assigned,
		 * which can be out of schema and err at runtime in the same way {@link Customizer.relaxed} does.
		 * Until with {@link Customizer.relaxed}, implicit construction is disabled, meaning all nodes must be explicitly constructed (and thus implement `T`) before being inserted.
		 */
		simplified<
			T extends (TreeNode | TreeLeafValue) & TreeNodeFromImplicitAllowedTypesUnsafe<TSchema>,
		>(): CustomizedSchemaTyping<
			TSchema,
			{
				input: T;
				readWrite: T;
				output: T;
			}
		>;

		/**
		 * The same as {@link System_Unsafe.CustomizerUnsafe.simplified} except that more T values are allowed, even ones not known to be implemented by `TSchema`.
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
		 * @remarks
		 * This can express any of the customizations possible via other {@link System_Unsafe.CustomizerUnsafe} methods:
		 * this API is however more verbose and can more easily be used to unsafe typing.
		 */
		custom<T extends Partial<CustomTypes>>(): CustomizedSchemaTyping<
			TSchema,
			Pick<CustomTypes, "readWrite" | "output"> & {
				// Check if property is provided. This check is needed to early out missing values so if undefined is allowed,
				// not providing the field doesn't overwrite the corresponding type with undefined.
				// TODO: test this case
				[Property in keyof CustomTypes]: Property extends keyof T
					? T[Property] extends CustomTypes[Property]
						? T[Property]
						: GetTypesUnsafe<TSchema>[Property]
					: GetTypesUnsafe<TSchema>[Property];
			}
		>;
	}

	/**
	 * {@link Unenforced} version of `AssignableTreeFieldFromImplicitField`.
	 * @remarks
	 * Do not use this type directly: its only needed in the implementation of generic logic which define recursive schema, not when using recursive schema.
	 * @privateRemarks
	 * Recursive version doesn't remove setters when this is never, so this uses covariant not contravariant union handling.
	 * @system @public
	 */
	export type AssignableTreeFieldFromImplicitFieldUnsafe<
		TSchema extends ImplicitFieldSchemaUnsafe,
	> = TSchema extends FieldSchemaUnsafe<infer Kind, infer Types>
		? ApplyKindAssignment<GetTypesUnsafe<Types>["readWrite"], Kind>
		: // TODO: why is this extends check needed? Should already narrow to ImplicitAllowedTypesUnsafe from above.
			TSchema extends ImplicitAllowedTypesUnsafe
			? GetTypesUnsafe<TSchema>["readWrite"]
			: never;

	/**
	 * {@link Unenforced} version of `TypesUnsafe`.
	 * @remarks
	 * Do not use this type directly: its only needed in the implementation of generic logic which define recursive schema, not when using recursive schema.
	 * @system @public
	 */
	export type GetTypesUnsafe<TSchema extends ImplicitAllowedTypesUnsafe> = [TSchema] extends [
		CustomizedSchemaTyping<unknown, infer TCustom>,
	]
		? TCustom
		: StrictTypesUnsafe<TSchema>;

	/**
	 * {@link Unenforced} version of `StrictTypes`.
	 * @remarks
	 * Do not use this type directly: its only needed in the implementation of generic logic which define recursive schema, not when using recursive schema.
	 * @system @public
	 */
	export interface StrictTypesUnsafe<
		TSchema extends ImplicitAllowedTypesUnsafe,
		TInput = DefaultInsertableTreeNodeFromImplicitAllowedTypesUnsafe<TSchema>,
		TOutput = DefaultTreeNodeFromImplicitAllowedTypesUnsafe<TSchema>,
	> {
		input: TInput;
		// Partial mitigation setter limitations (removal of setters when TInput is never by setting this to never) breaks compilation if used here,
		// so recursive objects end up allowing some unsafe assignments which will error at runtime.
		// This unsafety occurs when schema types are not exact, so output types are generalized which results in setters being generalized (wince they get the same type) which is unsafe.
		readWrite: TOutput; // TInput extends never ? never : TOutput;
		output: TOutput;
	}

	/**
	 * {@link Unenforced} version of `ObjectFromSchemaRecord`.
	 * @remarks
	 * Do not use this type directly: it's only needed in the implementation of generic logic which define recursive schema, not when using recursive schema.
	 * @privateRemarks
	 * This does not bother special casing `{}` since no one should make empty objects using the *Recursive APIs.
	 * @system @public
	 */
	export type ObjectFromSchemaRecordUnsafe<
		T extends RestrictiveStringRecord<ImplicitFieldSchemaUnsafe>,
	> =
		// Due to https://github.com/microsoft/TypeScript/issues/43826 we can not set the desired setter type.
		// Attempts to implement this in the cleaner way ObjectFromSchemaRecord uses cause recursive types to fail to compile.
		// Supporting explicit field schema wrapping CustomizedSchemaTyping here breaks compilation of recursive cases as well.
		{
			-readonly [Property in keyof T as [T[Property]] extends [
				CustomizedSchemaTyping<
					unknown,
					{
						readonly readWrite: never;
						readonly input: unknown;
						readonly output: TreeNode | TreeLeafValue;
					}
				>,
			]
				? never // Remove readWrite version for cases using CustomizedSchemaTyping to set readWrite to never.
				: // TODO : maybe filter out non string in logic above?
					Property]: Property extends string
				? AssignableTreeFieldFromImplicitFieldUnsafe<T[Property]>
				: unknown;
		} & {
			readonly [Property in keyof T as [T[Property]] extends [
				CustomizedSchemaTyping<
					unknown,
					{
						readonly readWrite: never;
						readonly input: unknown;
						readonly output: TreeNode | TreeLeafValue;
					}
				>,
			]
				? // Inverse of the conditional above: only include readonly fields when not including the readWrite one. This is required to make recursive types compile.
					Property
				: never]: Property extends string
				? TreeFieldFromImplicitFieldUnsafe<T[Property]>
				: unknown;
		};

	/**
	 * {@link Unenforced} version of {@link TreeNodeSchema}.
	 * @remarks
	 * Do not use this type directly: it is only needed in the implementation of generic logic which define recursive schema, not when using recursive schema.
	 * @system @public
	 */
	export type TreeNodeSchemaUnsafe<
		Name extends string = string,
		Kind extends NodeKind = NodeKind,
		TNode extends Unenforced<TreeNode | TreeLeafValue> = unknown,
		TBuild = never,
		ImplicitlyConstructable extends boolean = boolean,
		Info = unknown,
	> =
		| TreeNodeSchemaClassUnsafe<Name, Kind, TNode, TBuild, ImplicitlyConstructable, Info>
		| TreeNodeSchemaNonClassUnsafe<Name, Kind, TNode, TBuild, ImplicitlyConstructable, Info>;

	/**
	 * {@link Unenforced} version of {@link TreeNodeSchemaClass}.
	 * @remarks
	 * Do not use this type directly: it is only needed in the implementation of generic logic which define recursive schema, not when using recursive schema.
	 * @system @public
	 */
	export interface TreeNodeSchemaClassUnsafe<
		out Name extends string,
		out Kind extends NodeKind,
		out TNode extends Unenforced<TreeNode>,
		in TInsertable,
		out ImplicitlyConstructable extends boolean,
		out Info,
		out TCustomMetadata = unknown,
	> extends TreeNodeSchemaCore<
			Name,
			Kind,
			ImplicitlyConstructable,
			Info,
			never,
			TCustomMetadata
		> {
		/**
		 * Constructs an {@link Unhydrated} node with this schema.
		 * @remarks
		 * This constructor is also used internally to construct hydrated nodes with a different parameter type.
		 * Therefore, overriding this constructor with different argument types is not type-safe and is not supported.
		 * @sealed
		 */
		new (data: TInsertable | InternalTreeNode): Unhydrated<TNode>;
	}

	/**
	 * {@link Unenforced} version of {@link TreeNodeSchemaNonClass}.
	 * @remarks
	 * Do not use this type directly: it is only needed in the implementation of generic logic which define recursive schema, not when using recursive schema.
	 * @system @public
	 */
	export interface TreeNodeSchemaNonClassUnsafe<
		out Name extends string,
		out Kind extends NodeKind,
		out TNode extends Unenforced<TreeNode | TreeLeafValue>,
		in TInsertable,
		out ImplicitlyConstructable extends boolean,
		out Info = unknown,
	> extends TreeNodeSchemaCore<Name, Kind, ImplicitlyConstructable, Info> {
		create(data: TInsertable): TNode;
	}

	/**
	 * {@link Unenforced} version of {@link TreeObjectNode}.
	 * @remarks
	 * Do not use this type directly: it's only needed in the implementation of generic logic which define recursive schema, not when using recursive schema.
	 * @system @public
	 */
	export type TreeObjectNodeUnsafe<
		T extends RestrictiveStringRecord<ImplicitFieldSchemaUnsafe>,
		TypeName extends string = string,
	> = TreeNode & ObjectFromSchemaRecordUnsafe<T> & WithType<TypeName, NodeKind.Object, T>;

	/**
	 * {@link Unenforced} version of {@link TreeFieldFromImplicitField}.
	 * @remarks
	 * Do not use this type directly: it's only needed in the implementation of generic logic which define recursive schema, not when using recursive schema.
	 * @system @public
	 */
	export type TreeFieldFromImplicitFieldUnsafe<TSchema extends ImplicitFieldSchemaUnsafe> =
		TSchema extends FieldSchemaUnsafe<infer Kind, infer Types>
			? ApplyKind<TreeNodeFromImplicitAllowedTypesUnsafe<Types>, Kind>
			: TSchema extends ImplicitAllowedTypesUnsafe
				? TreeNodeFromImplicitAllowedTypesUnsafe<TSchema>
				: unknown;

	/**
	 * {@link Unenforced} version of {@link AllowedTypes}.
	 * @remarks
	 * Do not use this type directly: it is only needed in the implementation of generic logic which define recursive schema, not when using recursive schema.
	 * @system @public
	 */
	export type AllowedTypesUnsafe = readonly LazyItem<TreeNodeSchemaUnsafe>[];

	/**
	 * {@link Unenforced} version of {@link ImplicitAllowedTypes}.
	 * @remarks
	 * Do not use this type directly: it is only needed in the implementation of generic logic which define recursive schema, not when using recursive schema.
	 * @privateRemarks
	 * This is similar to `Unenforced<ImplicitAllowedTypes>` in that it avoids constraining the schema
	 * (which is necessary to avoid breaking recursive types),
	 * but is superior from a safety perspective because it constrains the structure containing the schema.
	 * @system @public
	 */
	export type ImplicitAllowedTypesUnsafe =
		| TreeNodeSchemaUnsafe
		// eslint-disable-next-line @typescript-eslint/no-unnecessary-type-arguments
		| readonly LazyItem<Unenforced<TreeNodeSchema>>[];

	/**
	 * {@link Unenforced} version of {@link ImplicitFieldSchema}.
	 * @remarks
	 * Do not use this type directly: it is only needed in the implementation of generic logic which define recursive schema, not when using recursive schema.
	 * @privateRemarks
	 * This is similar to `Unenforced<ImplicitFieldSchema>` in that it avoids constraining the schema
	 * (which is necessary to avoid breaking recursive types),
	 * but is superior from a safety perspective because it constrains the structure containing the schema.
	 * @system @public
	 */
	export type ImplicitFieldSchemaUnsafe =
		| FieldSchemaUnsafe<FieldKind, ImplicitAllowedTypesUnsafe>
		| ImplicitAllowedTypesUnsafe;

	/**
	 * {@link Unenforced} version of {@link TreeNodeFromImplicitAllowedTypes}.
	 * @remarks
	 * Do not use this type directly: it's only needed in the implementation of generic logic which define recursive schema, not when using recursive schema.
	 * @system @public
	 */
	export type TreeNodeFromImplicitAllowedTypesUnsafe<
		TSchema extends ImplicitAllowedTypesUnsafe,
	> = GetTypesUnsafe<TSchema>["output"];

	/**
	 * {@link Unenforced} version of {@link DefaultTreeNodeFromImplicitAllowedTypes}.
	 * @remarks
	 * Do not use this type directly: its only needed in the implementation of generic logic which define recursive schema, not when using recursive schema.
	 * @system @public
	 */
	export type DefaultTreeNodeFromImplicitAllowedTypesUnsafe<
		TSchema extends ImplicitAllowedTypesUnsafe,
	> = TSchema extends TreeNodeSchemaUnsafe
		? NodeFromSchemaUnsafe<TSchema>
		: TSchema extends AllowedTypesUnsafe
			? NodeFromSchemaUnsafe<FlexListToUnion<TSchema>>
			: unknown;

	/**
	 * {@link Unenforced} version of {@link InsertableTreeNodeFromImplicitAllowedTypes}.
	 * @see {@link Input}
	 * @remarks
	 * Do not use this type directly: it's only needed in the implementation of generic logic which define recursive schema, not when using recursive schema.
	 * @system @public
	 */
	export type InsertableTreeNodeFromImplicitAllowedTypesUnsafe<
		TSchema extends ImplicitAllowedTypesUnsafe,
	> = GetTypesUnsafe<TSchema>["input"];

	/**
	 * {@link Unenforced} version of {@link DefaultInsertableTreeNodeFromImplicitAllowedTypes}.
	 * @see {@link Input}
	 * @remarks
	 * Do not use this type directly: its only needed in the implementation of generic logic which define recursive schema, not when using recursive schema.
	 * @system @public
	 */
	export type DefaultInsertableTreeNodeFromImplicitAllowedTypesUnsafe<
		TSchema extends ImplicitAllowedTypesUnsafe,
	> = [TSchema] extends [TreeNodeSchemaUnsafe]
		? InsertableTypedNodeUnsafe<TSchema>
		: [TSchema] extends [AllowedTypesUnsafe]
			? InsertableTreeNodeFromAllowedTypesUnsafe<TSchema>
			: never;

	/**
	 * {@link Unenforced} version of {@link InsertableTreeNodeFromAllowedTypes}.
	 * @see {@link Input}
	 * @privateRemarks
	 * TODO: AB#36348: it seems like the order of the union this produces is what is non-deterministic in incremental builds
	 * of the JsonAsTree schema.
	 * @system @public
	 */
	export type InsertableTreeNodeFromAllowedTypesUnsafe<TList extends AllowedTypesUnsafe> =
		IsUnion<TList> extends true
			? never
			: {
					readonly [Property in keyof TList]: TList[Property] extends LazyItem<
						infer TSchema extends TreeNodeSchemaUnsafe
					>
						? InsertableTypedNodeUnsafe<TSchema>
						: never;
				}[number];

	/**
	 * {@link Unenforced} version of {@link InsertableTypedNode}.
	 * @see {@link Input}
	 * @remarks
	 * Do not use this type directly: it's only needed in the implementation of generic logic which define recursive schema, not when using recursive schema.
	 * @privateRemarks
	 * TODO:
	 * This is less strict than InsertableTypedNode when given non-exact schema to avoid compilation issues.
	 * This should probably be fixed or documented somehow.
	 * @system @public
	 */
	export type InsertableTypedNodeUnsafe<
		TSchema extends TreeNodeSchemaUnsafe,
		T = UnionToIntersection<TSchema>,
	> =
		| (T extends TreeNodeSchemaUnsafe<string, NodeKind, TreeNode | TreeLeafValue, never, true>
				? NodeBuilderDataUnsafe<T>
				: never)
		| (T extends TreeNodeSchemaUnsafe ? NodeFromSchemaUnsafe<T> : never);

	/**
	 * {@link Unenforced} version of {@link NodeFromSchema}.
	 * @remarks
	 * Do not use this type directly: it's only needed in the implementation of generic logic which define recursive schema, not when using recursive schema.
	 * @system @public
	 */
	export type NodeFromSchemaUnsafe<T extends Unenforced<TreeNodeSchema>> =
		T extends TreeNodeSchemaUnsafe<string, NodeKind, infer TNode> ? TNode : never;

	/**
	 * {@link Unenforced} version of {@link InsertableTreeNodeFromImplicitAllowedTypes}.
	 * @remarks
	 * Do not use this type directly: it's only needed in the implementation of generic logic which define recursive schema, not when using recursive schema.
	 * @system @public
	 */
	export type NodeBuilderDataUnsafe<T extends Unenforced<TreeNodeSchema>> =
		T extends TreeNodeSchemaUnsafe<string, NodeKind, unknown, infer TBuild> ? TBuild : never;

	/**
	 * {@link Unenforced} version of {@link (TreeArrayNode:interface)}.
	 * @remarks
	 * Do not use this type directly: it's only needed in the implementation of generic logic which define recursive schema, not when using recursive schema.
	 * @system @sealed @public
	 */
	export interface TreeArrayNodeUnsafe<TAllowedTypes extends ImplicitAllowedTypesUnsafe>
		extends TreeArrayNode<
			TAllowedTypes,
			TreeNodeFromImplicitAllowedTypesUnsafe<TAllowedTypes>,
			InsertableTreeNodeFromImplicitAllowedTypesUnsafe<TAllowedTypes>
		> {}

	/**
	 * {@link Unenforced} version of {@link TreeMapNode}.
	 * @remarks
	 * Do not use this type directly: it's only needed in the implementation of generic logic which define recursive schema, not when using recursive schema.
	 * @system @sealed @public
	 */
	export interface TreeMapNodeUnsafe<T extends ImplicitAllowedTypesUnsafe>
		extends ReadonlyMapInlined<string, T>,
			TreeNode {
		/**
		 * {@inheritdoc TreeMapNode.set}
		 */
		set(
			key: string,
			value: InsertableTreeNodeFromImplicitAllowedTypesUnsafe<T> | undefined,
		): void;

		/**
		 * {@inheritdoc TreeMapNode.delete}
		 */
		delete(key: string): void;
	}

	/**
	 * Copy of TypeScript's ReadonlyMap, but with `TreeNodeFromImplicitAllowedTypesUnsafe<T>` inlined into it.
	 * Using this instead of ReadonlyMap in TreeMapNodeUnsafe is necessary to make recursive map schema not generate compile errors in the d.ts files when exported.
	 * @remarks
	 * Do not use this type directly: it's only needed in the implementation of generic logic which define recursive schema, not when using recursive schema.
	 * @privateRemarks
	 * This is the same as `ReadonlyMap<K, TreeNodeFromImplicitAllowedTypesUnsafe<T>>` (Checked in test),
	 * except that it avoids the above mentioned compile error.
	 * Authored by manually inlining ReadonlyMap from from the TypeScript lib which can be found by navigating to the definition of `ReadonlyMap`.
	 * @system @sealed @public
	 */
	export interface ReadonlyMapInlined<K, T extends ImplicitAllowedTypesUnsafe> {
		/** Returns an iterable of entries in the map. */
		[Symbol.iterator](): IterableIterator<[K, TreeNodeFromImplicitAllowedTypesUnsafe<T>]>;

		/**
		 * Returns an iterable of key, value pairs for every entry in the map.
		 */
		entries(): IterableIterator<[K, TreeNodeFromImplicitAllowedTypesUnsafe<T>]>;

		/**
		 * Returns an iterable of keys in the map
		 */
		keys(): IterableIterator<K>;

		/**
		 * Returns an iterable of values in the map
		 */
		values(): IterableIterator<TreeNodeFromImplicitAllowedTypesUnsafe<T>>;

		forEach(
			callbackfn: (
				value: TreeNodeFromImplicitAllowedTypesUnsafe<T>,
				key: K,
				map: ReadonlyMap<K, TreeNodeFromImplicitAllowedTypesUnsafe<T>>,
			) => void,
			thisArg?: any,
		): void;
		get(key: K): TreeNodeFromImplicitAllowedTypesUnsafe<T> | undefined;
		has(key: K): boolean;
		readonly size: number;
	}

	/**
	 * {@link Unenforced} version of `FieldHasDefault`.
	 * @remarks
	 * Do not use this type directly: it's only needed in the implementation of generic logic which define recursive schema, not when using recursive schema.
	 * @system @sealed @public
	 */
	export type FieldHasDefaultUnsafe<T extends ImplicitFieldSchemaUnsafe> =
		T extends FieldSchemaUnsafe<
			FieldKind.Optional | FieldKind.Identifier,
			ImplicitAllowedTypesUnsafe
		>
			? true
			: false;

	/**
	 * {@link Unenforced} version of `InsertableObjectFromSchemaRecord`.
	 * @see {@link Input}
	 * @remarks
	 * Do not use this type directly: it's only needed in the implementation of generic logic which define recursive schema, not when using recursive schema.
	 * @system @public
	 */
	export type InsertableObjectFromSchemaRecordUnsafe<
		T extends RestrictiveStringRecord<ImplicitFieldSchemaUnsafe>,
	> = {
		// Field might not have a default, so make it required:
		readonly [Property in keyof T as FieldHasDefaultUnsafe<T[Property & string]> extends false
			? Property
			: never]: InsertableTreeFieldFromImplicitFieldUnsafe<T[Property & string]>;
	} & {
		// Field might have a default, so allow optional.
		// Note that if the field could be either, this returns boolean, causing both fields to exist, resulting in required.
		readonly [Property in keyof T as FieldHasDefaultUnsafe<T[Property & string]> extends true
			? Property
			: never]?: InsertableTreeFieldFromImplicitFieldUnsafe<T[Property & string]>;
	};

	/**
	 * {@link Unenforced} version of {@link InsertableTreeFieldFromImplicitField}.
	 * @see {@link Input}
	 * @remarks
	 * Do not use this type directly: it's only needed in the implementation of generic logic which define recursive schema, not when using recursive schema.
	 * @system @public
	 */
	export type InsertableTreeFieldFromImplicitFieldUnsafe<
		TSchemaInput extends ImplicitFieldSchemaUnsafe,
		TSchema = UnionToIntersection<TSchemaInput>,
	> = [TSchema] extends [FieldSchemaUnsafe<infer Kind, infer Types>]
		? ApplyKindInput<InsertableTreeNodeFromImplicitAllowedTypesUnsafe<Types>, Kind, true>
		: [TSchema] extends [ImplicitAllowedTypes]
			? InsertableTreeNodeFromImplicitAllowedTypesUnsafe<TSchema>
			: never;

	/**
	 * {@link Unenforced} version of {@link FieldSchema}.
	 * @remarks
	 * Do not use this type directly: it's only needed in the implementation of generic logic which define recursive schema, not when using recursive schema.
	 * @system @sealed @public
	 */
	export interface FieldSchemaUnsafe<
		out Kind extends FieldKind,
		out Types extends ImplicitAllowedTypesUnsafe,
		out TCustomMetadata = unknown,
	> extends FieldSchema<Kind, any, TCustomMetadata> {
		/**
		 * {@inheritDoc FieldSchema.kind}
		 */
		readonly kind: Kind;
		/**
		 * {@inheritDoc FieldSchema.allowedTypes}
		 */
		readonly allowedTypes: Types;
		/**
		 * {@inheritDoc FieldSchema.allowedTypeSet}
		 */
		readonly allowedTypeSet: ReadonlySet<TreeNodeSchema>;
	}
}

/**
 * {@link Unenforced} version of {@link FieldSchemaAlpha}.
 * @remarks
 * Do not use this type directly: it's only needed in the implementation of generic logic which define recursive schema, not when using recursive schema.
 * @system @sealed @alpha
 */
export interface FieldSchemaAlphaUnsafe<
	out Kind extends FieldKind,
	out Types extends System_Unsafe.ImplicitAllowedTypesUnsafe,
	out TCustomMetadata = unknown,
> extends FieldSchemaAlpha<Kind, any, TCustomMetadata>,
		System_Unsafe.FieldSchemaUnsafe<Kind, Types, TCustomMetadata> {
	/**
	 * {@inheritDoc FieldSchema.allowedTypes}
	 */
	readonly allowedTypes: Types;
}

/* eslint-enable @typescript-eslint/no-explicit-any */

/**
 * {@link Unenforced} version of {@link ArrayNodeCustomizableSchema}s.
 * @remarks
 * Do not use this type directly: it's only needed in the implementation of generic logic which define recursive schema, not when using recursive schema.
 * @sealed
 * @alpha
 * @system
 */
export interface ArrayNodeCustomizableSchemaUnsafe<
	out TName extends string,
	in out T extends System_Unsafe.ImplicitAllowedTypesUnsafe,
	out TCustomMetadata,
> extends TreeNodeSchemaClass<
			TName,
			NodeKind.Array,
			System_Unsafe.TreeArrayNodeUnsafe<T> & WithType<TName, NodeKind.Array, T>,
			{
				[Symbol.iterator](): Iterator<
					System_Unsafe.InsertableTreeNodeFromImplicitAllowedTypesUnsafe<T>
				>;
			},
			false,
			T,
			undefined,
			TCustomMetadata
		>,
		SimpleArrayNodeSchema<TCustomMetadata> {}

/**
 * {@link Unenforced} version of {@link MapNodeCustomizableSchema}s.
 * @remarks
 * Do not use this type directly: it's only needed in the implementation of generic logic which define recursive schema, not when using recursive schema.
 * @sealed
 * @alpha
 * @system
 */
export interface MapNodeCustomizableSchemaUnsafe<
	out TName extends string,
	in out T extends System_Unsafe.ImplicitAllowedTypesUnsafe,
	out TCustomMetadata,
> extends TreeNodeSchemaClass<
			TName,
			NodeKind.Map,
			System_Unsafe.TreeMapNodeUnsafe<T> & WithType<TName, NodeKind.Map, T>,
			| {
					[Symbol.iterator](): Iterator<
						[string, System_Unsafe.InsertableTreeNodeFromImplicitAllowedTypesUnsafe<T>]
					>;
			  }
			| {
					readonly [P in string]: System_Unsafe.InsertableTreeNodeFromImplicitAllowedTypesUnsafe<T>;
			  },
			false,
			T,
			undefined,
			TCustomMetadata
		>,
		SimpleMapNodeSchema<TCustomMetadata> {}

/**
 * {@link Unenforced} version of {@link TreeRecordNode}.
 * @remarks
 * Do not use this type directly: it's only needed in the implementation of generic logic which define recursive schema, not when using recursive schema.
 * @system @sealed @beta
 */
export interface TreeRecordNodeUnsafe<
	TAllowedTypes extends System_Unsafe.ImplicitAllowedTypesUnsafe,
> extends Record<string, System_Unsafe.TreeNodeFromImplicitAllowedTypesUnsafe<TAllowedTypes>>,
		TreeNode {
	[Symbol.iterator](): IterableIterator<
		[string, System_Unsafe.TreeNodeFromImplicitAllowedTypesUnsafe<TAllowedTypes>]
	>;
}

/**
 * {@link Unenforced} utility to remove {@link AnnotatedAllowedTypeUnsafe} wrappers.
 * @remarks
 * Do not use this type directly: it's only needed in the implementation of generic logic which define recursive schema, not when using recursive schema.
 * @sealed
 * @alpha
 * @system
 */
export type UnannotateAllowedTypeUnsafe<
	T extends Unenforced<
		AnnotatedAllowedTypeUnsafe | LazyItem<System_Unsafe.TreeNodeSchemaUnsafe>
	>,
> = T extends AnnotatedAllowedTypeUnsafe<infer X> ? X : T;

/**
 * {@link Unenforced} version of {@link AnnotatedAllowedType}.
 * @remarks
 * Do not use this type directly: it's only needed in the implementation of generic logic which define recursive schema, not when using recursive schema.
 * @system @sealed @alpha
 */
export interface AnnotatedAllowedTypeUnsafe<T = Unenforced<LazyItem<TreeNodeSchema>>>
	extends AnnotatedAllowedType<T> {}

/**
 * {@link Unenforced} version of {@link AnnotatedAllowedTypes}.
 * @remarks
 * Do not use this type directly: it's only needed in the implementation of generic logic which define recursive schema, not when using recursive schema.
 * @system @sealed @alpha
 */
export interface AnnotatedAllowedTypesUnsafe
	extends AnnotatedAllowedTypes<LazyItem<System_Unsafe.TreeNodeSchemaUnsafe>> {}

/**
 * {@link Unenforced} version of {@link AllowedTypesFull}.
 * @remarks
 * Do not use this type directly: it's only needed in the implementation of generic logic which define recursive schema, not when using recursive schema.
 * @system @sealed @alpha
 */
export type AllowedTypesFullUnsafe<
	T extends readonly AnnotatedAllowedTypeUnsafe[] = readonly AnnotatedAllowedTypeUnsafe[],
> = AnnotatedAllowedTypes<T> & UnannotateAllowedTypesListUnsafe<T>;

/**
 * {@link Unenforced} version of {@link AllowedTypesFullFromMixed}.
 * @remarks
 * Do not use this type directly: it's only needed in the implementation of generic logic which define recursive schema, not when using recursive schema.
 * @system @sealed @alpha
 */
export type AllowedTypesFullFromMixedUnsafe<
	T extends readonly Unenforced<AnnotatedAllowedType | LazyItem<TreeNodeSchema>>[],
> = UnannotateAllowedTypesListUnsafe<T> &
	AnnotatedAllowedTypes<AnnotateAllowedTypesListUnsafe<T>>;

/**
 * {@link Unenforced} version of {@link UnannotateAllowedTypesList}.
 * @remarks
 * Do not use this type directly: it's only needed in the implementation of generic logic which define recursive schema, not when using recursive schema.
 * @system @sealed @alpha
 */
export type UnannotateAllowedTypesListUnsafe<
	T extends readonly Unenforced<AnnotatedAllowedType | LazyItem<TreeNodeSchema>>[],
> = {
	readonly [I in keyof T]: T[I] extends { type: infer X } ? X : T[I];
};

/**
 * {@link Unenforced} version of {@link AnnotateAllowedTypesList}.
 * @remarks
 * Do not use this type directly: it's only needed in the implementation of generic logic which define recursive schema, not when using recursive schema.
 * @system @sealed @alpha
 */
export type AnnotateAllowedTypesListUnsafe<
	T extends readonly Unenforced<AnnotatedAllowedType | LazyItem<TreeNodeSchema>>[],
> = {
	[I in keyof T]: T[I] extends AnnotatedAllowedTypeUnsafe
		? T[I]
		: AnnotatedAllowedTypeUnsafe<T[I]>;
};
