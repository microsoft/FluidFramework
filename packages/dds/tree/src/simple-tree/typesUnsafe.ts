/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import type { FlexListToUnion, Unenforced } from "../feature-libraries/index.js";
import type { RestrictiveReadonlyRecord, _InlineTrick } from "../util/index.js";

import type {
	AllowedTypes,
	ApplyKind,
	FieldKind,
	FieldSchema,
	ImplicitAllowedTypes,
	ImplicitFieldSchema,
	NodeFromSchema,
	TreeNodeFromImplicitAllowedTypes,
} from "./schemaTypes.js";
import type {
	NodeKind,
	TreeNodeSchema,
	WithType,
	TreeNode,
	Unhydrated,
} from "./core/index.js";
import type { TreeArrayNodeBase, TreeArrayNode } from "./arrayNode.js";

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
 * {@link Unenforced} version of `ObjectFromSchemaRecord`.
 * @remarks
 * Do note use this type directly: its only needed in the implementation of generic logic which define recursive schema, not when using recursive schema.
 * @public
 */
export type ObjectFromSchemaRecordUnsafe<
	T extends Unenforced<RestrictiveReadonlyRecord<string, ImplicitFieldSchema>>,
> = {
	-readonly [Property in keyof T]: TreeFieldFromImplicitFieldUnsafe<T[Property]>;
};

/**
 * {@link Unenforced} version of {@link TreeObjectNode}.
 * @remarks
 * Do note use this type directly: its only needed in the implementation of generic logic which define recursive schema, not when using recursive schema.
 * @public
 */
export type TreeObjectNodeUnsafe<
	T extends Unenforced<RestrictiveReadonlyRecord<string, ImplicitFieldSchema>>,
	TypeName extends string = string,
> = TreeNode & ObjectFromSchemaRecordUnsafe<T> & WithType<TypeName, NodeKind.Object>;

/**
 * {@link Unenforced} version of {@link TreeFieldFromImplicitField}.
 * @remarks
 * Do note use this type directly: its only needed in the implementation of generic logic which define recursive schema, not when using recursive schema.
 * @public
 */
export type TreeFieldFromImplicitFieldUnsafe<TSchema extends Unenforced<ImplicitFieldSchema>> =
	TSchema extends FieldSchemaUnsafe<infer Kind, infer Types>
		? ApplyKind<TreeNodeFromImplicitAllowedTypesUnsafe<Types>, Kind, false>
		: TSchema extends ImplicitAllowedTypes
			? TreeNodeFromImplicitAllowedTypesUnsafe<TSchema>
			: unknown;

/**
 * {@link Unenforced} version of {@link TreeNodeFromImplicitAllowedTypes}.
 * @remarks
 * Do note use this type directly: its only needed in the implementation of generic logic which define recursive schema, not when using recursive schema.
 * @public
 */
export type TreeNodeFromImplicitAllowedTypesUnsafe<
	TSchema extends Unenforced<ImplicitAllowedTypes>,
> = TSchema extends ImplicitAllowedTypes
	? TreeNodeFromImplicitAllowedTypes<TSchema>
	: TSchema extends TreeNodeSchema
		? NodeFromSchema<TSchema>
		: TSchema extends AllowedTypes
			? NodeFromSchema<FlexListToUnion<TSchema>>
			: unknown;

/**
 * {@link Unenforced} version of {@link InsertableTreeNodeFromImplicitAllowedTypes}.
 * @remarks
 * Do note use this type directly: its only needed in the implementation of generic logic which define recursive schema, not when using recursive schema.
 * @public
 */
export type InsertableTreeNodeFromImplicitAllowedTypesUnsafe<
	TSchema extends Unenforced<ImplicitAllowedTypes>,
> = TSchema extends AllowedTypes
	? InsertableTypedNodeUnsafe<FlexListToUnion<TSchema>>
	: InsertableTypedNodeUnsafe<TSchema>;

/**
 * {@link Unenforced} version of {@link InsertableTypedNode}.
 * @remarks
 * Do note use this type directly: its only needed in the implementation of generic logic which define recursive schema, not when using recursive schema.
 * @public
 */
export type InsertableTypedNodeUnsafe<T extends Unenforced<TreeNodeSchema>> = [
	| Unhydrated<NodeFromSchemaUnsafe<T>>
	| (T extends { implicitlyConstructable: true } ? NodeBuilderDataUnsafe<T> : never),
][_InlineTrick];

/**
 * {@link Unenforced} version of {@link NodeFromSchema}.
 * @remarks
 * Do note use this type directly: its only needed in the implementation of generic logic which define recursive schema, not when using recursive schema.
 * @public
 */
export type NodeFromSchemaUnsafe<T extends Unenforced<TreeNodeSchema>> =
	T extends TreeNodeSchema<string, NodeKind, infer TNode> ? TNode : never;

/**
 * {@link Unenforced} version of {@link InsertableTreeNodeFromImplicitAllowedTypes}.
 * @remarks
 * Do note use this type directly: its only needed in the implementation of generic logic which define recursive schema, not when using recursive schema.
 * @public
 */
export type NodeBuilderDataUnsafe<T extends Unenforced<TreeNodeSchema>> =
	T extends TreeNodeSchema<string, NodeKind, unknown, infer TBuild> ? TBuild : never;

/**
 * {@link Unenforced} version of {@link (TreeArrayNode:interface)}.
 * @remarks
 * Do note use this type directly: its only needed in the implementation of generic logic which define recursive schema, not when using recursive schema.
 * @sealed @public
 */
export interface TreeArrayNodeUnsafe<TAllowedTypes extends Unenforced<ImplicitAllowedTypes>>
	extends TreeArrayNodeBase<
		TreeNodeFromImplicitAllowedTypesUnsafe<TAllowedTypes>,
		InsertableTreeNodeFromImplicitAllowedTypesUnsafe<TAllowedTypes>,
		TreeArrayNode
	> {}

/**
 * {@link Unenforced} version of {@link TreeMapNode}.
 * @remarks
 * Do note use this type directly: its only needed in the implementation of generic logic which define recursive schema, not when using recursive schema.
 * @sealed @public
 */
export interface TreeMapNodeUnsafe<T extends Unenforced<ImplicitAllowedTypes>>
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
 * Do note use this type directly: its only needed in the implementation of generic logic which define recursive schema, not when using recursive schema.
 * @privateRemarks
 * This is the same as `ReadonlyMap<K, TreeNodeFromImplicitAllowedTypesUnsafe<T>>` (Checked in test),
 * except that it avoids the above mentioned compile error.
 * Authored by manually inlining ReadonlyMap from from the TypeScript lib which can be found by navigating to the definition of `ReadonlyMap`.
 * @system @sealed @public
 */
export interface ReadonlyMapInlined<K, T extends Unenforced<ImplicitAllowedTypes>> {
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
 * Do note use this type directly: its only needed in the implementation of generic logic which define recursive schema, not when using recursive schema.
 * @sealed @public
 */
export type FieldHasDefaultUnsafe<T extends Unenforced<ImplicitFieldSchema>> =
	T extends FieldSchemaUnsafe<
		FieldKind.Optional | FieldKind.Identifier,
		Unenforced<ImplicitAllowedTypes>
	>
		? true
		: false;

/**
 * {@link Unenforced} version of `InsertableObjectFromSchemaRecord`.
 * @remarks
 * Do note use this type directly: its only needed in the implementation of generic logic which define recursive schema, not when using recursive schema.
 * @public
 */
export type InsertableObjectFromSchemaRecordUnsafe<
	T extends Unenforced<RestrictiveReadonlyRecord<string, ImplicitFieldSchema>>,
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
 * @remarks
 * Do note use this type directly: its only needed in the implementation of generic logic which define recursive schema, not when using recursive schema.
 * @public
 */
export type InsertableTreeFieldFromImplicitFieldUnsafe<
	TSchema extends Unenforced<ImplicitFieldSchema>,
> = TSchema extends FieldSchemaUnsafe<infer Kind, infer Types>
	? ApplyKind<InsertableTreeNodeFromImplicitAllowedTypesUnsafe<Types>, Kind, true>
	: InsertableTreeNodeFromImplicitAllowedTypesUnsafe<TSchema>;

/**
 * {@link Unenforced} version of {@link FieldSchema}.
 * @remarks
 * Do note use this type directly: its only needed in the implementation of generic logic which define recursive schema, not when using recursive schema.
 * @public
 */
export interface FieldSchemaUnsafe<
	out Kind extends FieldKind,
	out Types extends Unenforced<ImplicitAllowedTypes>,
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
