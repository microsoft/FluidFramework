/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import type { RestrictiveStringRecord, UnionToIntersection } from "../../util/index.js";

import type {
	ApplyKind,
	ApplyKindInput,
	FieldKind,
	FieldSchema,
	ImplicitAllowedTypes,
	ImplicitFieldSchema,
	TreeLeafValue,
} from "../schemaTypes.js";
import type {
	NodeKind,
	WithType,
	TreeNode,
	Unhydrated,
	InternalTreeNode,
	TreeNodeSchema,
	TreeNodeSchemaCore,
} from "../core/index.js";
import type { TreeArrayNode } from "../arrayNode.js";
import type { FlexListToUnion, LazyItem } from "../flexList.js";

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
 * {@link Unenforced} version of `ObjectFromSchemaRecord`.
 * @remarks
 * Do not use this type directly: it's only needed in the implementation of generic logic which define recursive schema, not when using recursive schema.
 * @system @public
 */
export type ObjectFromSchemaRecordUnsafe<
	T extends Unenforced<RestrictiveStringRecord<ImplicitFieldSchema>>,
> = {
	-readonly [Property in keyof T]: TreeFieldFromImplicitFieldUnsafe<T[Property]>;
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
> extends TreeNodeSchemaCore<Name, Kind, ImplicitlyConstructable, Info> {
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
	T extends Unenforced<RestrictiveStringRecord<ImplicitFieldSchema>>,
	TypeName extends string = string,
> = TreeNode & ObjectFromSchemaRecordUnsafe<T> & WithType<TypeName, NodeKind.Object>;

/**
 * {@link Unenforced} version of {@link TreeFieldFromImplicitField}.
 * @remarks
 * Do not use this type directly: it's only needed in the implementation of generic logic which define recursive schema, not when using recursive schema.
 * @system @public
 */
export type TreeFieldFromImplicitFieldUnsafe<TSchema extends Unenforced<ImplicitFieldSchema>> =
	TSchema extends FieldSchemaUnsafe<infer Kind, infer Types>
		? ApplyKind<TreeNodeFromImplicitAllowedTypesUnsafe<Types>, Kind>
		: TSchema extends ImplicitAllowedTypes
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
export type UnenforcedImplicitAllowedTypes =
	| TreeNodeSchemaUnsafe
	// eslint-disable-next-line @typescript-eslint/no-unnecessary-type-arguments
	| readonly LazyItem<Unenforced<TreeNodeSchema>>[];

/**
 * {@link Unenforced} version of {@link TreeNodeFromImplicitAllowedTypes}.
 * @remarks
 * Do not use this type directly: it's only needed in the implementation of generic logic which define recursive schema, not when using recursive schema.
 * @system @public
 */
export type TreeNodeFromImplicitAllowedTypesUnsafe<
	TSchema extends UnenforcedImplicitAllowedTypes,
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
	TSchema extends UnenforcedImplicitAllowedTypes,
> = [TSchema] extends [TreeNodeSchemaUnsafe]
	? InsertableTypedNodeUnsafe<TSchema>
	: [TSchema] extends [AllowedTypesUnsafe]
		? InsertableTreeNodeFromAllowedTypesUnsafe<TSchema>
		: never;

/**
 * {@link Unenforced} version of {@link InsertableTreeNodeFromAllowedTypes}.
 * @see {@link Input}
 * @system @public
 */
export type InsertableTreeNodeFromAllowedTypesUnsafe<
	TList extends Unenforced<AllowedTypesUnsafe>,
> = TList extends readonly [
	LazyItem<infer TSchema extends TreeNodeSchemaUnsafe>,
	...infer Rest extends AllowedTypesUnsafe,
]
	? InsertableTypedNodeUnsafe<TSchema> | InsertableTreeNodeFromAllowedTypesUnsafe<Rest>
	: never;

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
	TSchema extends Unenforced<TreeNodeSchemaUnsafe>,
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
export interface TreeArrayNodeUnsafe<TAllowedTypes extends UnenforcedImplicitAllowedTypes>
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
export interface TreeMapNodeUnsafe<T extends UnenforcedImplicitAllowedTypes>
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
export interface ReadonlyMapInlined<K, T extends UnenforcedImplicitAllowedTypes> {
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
export type FieldHasDefaultUnsafe<T extends Unenforced<ImplicitFieldSchema>> =
	T extends FieldSchemaUnsafe<
		FieldKind.Optional | FieldKind.Identifier,
		UnenforcedImplicitAllowedTypes
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
	T extends Unenforced<RestrictiveStringRecord<ImplicitFieldSchema>>,
> = {
	// Field might not have a default, so make it required:
	readonly [Property in keyof T as FieldHasDefaultUnsafe<T[Property]> extends false
		? Property
		: never]: InsertableTreeFieldFromImplicitFieldUnsafe<T[Property]>;
} & {
	// Field might have a default, so allow optional.
	// Note that if the field could be either, this returns boolean, causing both fields to exist, resulting in required.
	readonly [Property in keyof T as FieldHasDefaultUnsafe<T[Property]> extends true
		? Property
		: never]?: InsertableTreeFieldFromImplicitFieldUnsafe<T[Property]>;
};

/**
 * {@link Unenforced} version of {@link InsertableTreeFieldFromImplicitField}.
 * @see {@link Input}
 * @remarks
 * Do not use this type directly: it's only needed in the implementation of generic logic which define recursive schema, not when using recursive schema.
 * @system @public
 */
export type InsertableTreeFieldFromImplicitFieldUnsafe<
	TSchemaInput extends Unenforced<ImplicitFieldSchema>,
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
 * @public
 */
export interface FieldSchemaUnsafe<
	out Kind extends FieldKind,
	out Types extends UnenforcedImplicitAllowedTypes,
> extends FieldSchema<Kind, any> {
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

/* eslint-enable @typescript-eslint/no-explicit-any */
