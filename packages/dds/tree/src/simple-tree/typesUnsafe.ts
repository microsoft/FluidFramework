/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { FlexListToUnion, Unenforced } from "../feature-libraries/index.js";
import { RestrictiveReadonlyRecord } from "../util/index.js";
import {
	AllowedTypes,
	ApplyKind,
	FieldKind,
	ImplicitAllowedTypes,
	ImplicitFieldSchema,
	NodeFromSchema,
	NodeKind,
	TreeNodeFromImplicitAllowedTypes,
	TreeNodeSchema,
} from "./schemaTypes.js";
import { TreeArrayNode } from "./treeArrayNode.js";
import { TreeArrayNodeBase, TreeNode, Unhydrated } from "./types.js";

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

/**
 * {@link Unenforced} version of {@link ObjectFromSchemaRecord}.
 * @beta
 */
export type ObjectFromSchemaRecordUnsafe<
	T extends Unenforced<RestrictiveReadonlyRecord<string, ImplicitFieldSchema>>,
> = {
	-readonly [Property in keyof T]: TreeFieldFromImplicitFieldUnsafe<T[Property]>;
};

/**
 * {@link Unenforced} version of {@link TreeFieldFromImplicitField}.
 * @beta
 */
export type TreeFieldFromImplicitFieldUnsafe<TSchema extends Unenforced<ImplicitFieldSchema>> =
	TSchema extends FieldSchemaUnsafe<infer Kind, infer Types>
		? ApplyKind<TreeNodeFromImplicitAllowedTypesUnsafe<Types>, Kind>
		: TSchema extends ImplicitAllowedTypes
		? TreeNodeFromImplicitAllowedTypesUnsafe<TSchema>
		: unknown;

/**
 * {@link Unenforced} version of {@link TreeNodeFromImplicitAllowedTypes}.
 * @beta
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
 * @beta
 */
export type InsertableTreeNodeFromImplicitAllowedTypesUnsafe<
	TSchema extends Unenforced<ImplicitAllowedTypes>,
> = TSchema extends AllowedTypes
	? InsertableTypedNodeUnsafe<FlexListToUnion<TSchema>>
	: InsertableTypedNodeUnsafe<TSchema>;

/**
 * {@link Unenforced} version of {@link InsertableTypedNode}.
 * @beta
 */
export type InsertableTypedNodeUnsafe<T extends Unenforced<TreeNodeSchema>> =
	| Unhydrated<NodeFromSchemaUnsafe<T>>
	| (T extends { implicitlyConstructable: true } ? NodeBuilderDataUnsafe<T> : never);

/**
 * {@link Unenforced} version of {@link NodeFromSchema}.
 * @beta
 */
export type NodeFromSchemaUnsafe<T extends Unenforced<TreeNodeSchema>> = T extends TreeNodeSchema<
	string,
	NodeKind,
	infer TNode
>
	? TNode
	: never;

/**
 * {@link Unenforced} version of {@link InsertableTreeNodeFromImplicitAllowedTypes}.
 * @beta
 */
export type NodeBuilderDataUnsafe<T extends Unenforced<TreeNodeSchema>> = T extends TreeNodeSchema<
	string,
	NodeKind,
	unknown,
	infer TBuild
>
	? TBuild
	: never;

/**
 * {@link Unenforced} version of {@link (TreeArrayNode:interface)}.
 * @beta
 */
export interface TreeArrayNodeUnsafe<TAllowedTypes extends Unenforced<ImplicitAllowedTypes>>
	extends TreeNode,
		TreeArrayNodeBase<
			TreeNodeFromImplicitAllowedTypesUnsafe<TAllowedTypes>,
			InsertableTreeNodeFromImplicitAllowedTypesUnsafe<TAllowedTypes>,
			TreeArrayNode
		> {}

/**
 * {@link Unenforced} version of {@link TreeMapNode}.
 * @beta
 */
export interface TreeMapNodeUnsafe<T extends Unenforced<ImplicitAllowedTypes>>
	extends ReadonlyMap<string, TreeNodeFromImplicitAllowedTypesUnsafe<T>>,
		TreeNode {
	/**
	 * {@inheritdoc TreeMapNode.set}
	 */
	set(key: string, value: InsertableTreeNodeFromImplicitAllowedTypesUnsafe<T> | undefined): void;

	/**
	 * {@inheritdoc TreeMapNode.delete}
	 */
	delete(key: string): void;
}

/**
 * {@link Unenforced} version of {@link InsertableObjectFromSchemaRecord}.
 * @beta
 */
export type InsertableObjectFromSchemaRecordUnsafe<
	T extends Unenforced<RestrictiveReadonlyRecord<string, ImplicitFieldSchema>>,
> = {
	readonly [Property in keyof T]: InsertableTreeFieldFromImplicitFieldUnsafe<T[Property]>;
};

/**
 * {@link Unenforced} version of {@link InsertableTreeFieldFromImplicitField}.
 * @beta
 */
export type InsertableTreeFieldFromImplicitFieldUnsafe<
	TSchema extends Unenforced<ImplicitFieldSchema>,
> = TSchema extends FieldSchemaUnsafe<infer Kind, infer Types>
	? ApplyKind<InsertableTreeNodeFromImplicitAllowedTypesUnsafe<Types>, Kind>
	: InsertableTreeNodeFromImplicitAllowedTypesUnsafe<TSchema>;

/**
 * {@link Unenforced} version of {@link FieldSchema}.
 * @beta
 */
export interface FieldSchemaUnsafe<
	out Kind extends FieldKind,
	out Types extends Unenforced<ImplicitAllowedTypes>,
> {
	readonly kind: Kind;
	readonly allowedTypes: Types;
}
