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
	type FieldSchema,
	ImplicitAllowedTypes,
	ImplicitFieldSchema,
	NodeFromSchema,
	NodeKind,
	TreeNodeFromImplicitAllowedTypes,
	TreeNodeSchema,
	WithType,
} from "./schemaTypes.js";
import { TreeArrayNodeBase, TreeArrayNode } from "./arrayNode.js";
import { TreeNode, Unhydrated } from "./types.js";

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
 * {@link Unenforced} version of {@link ObjectFromSchemaRecord}.
 * @public
 */
export type ObjectFromSchemaRecordUnsafe<
	T extends Unenforced<RestrictiveReadonlyRecord<string, ImplicitFieldSchema>>,
> = {
	-readonly [Property in keyof T]: TreeFieldFromImplicitFieldUnsafe<T[Property]>;
};

/**
 * {@link Unenforced} version of {@link TreeObjectNode}.
 * @public
 */
export type TreeObjectNodeUnsafe<
	T extends Unenforced<RestrictiveReadonlyRecord<string, ImplicitFieldSchema>>,
	TypeName extends string = string,
> = TreeNode & ObjectFromSchemaRecordUnsafe<T> & WithType<TypeName>;

/**
 * {@link Unenforced} version of {@link TreeFieldFromImplicitField}.
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
 * @public
 */
export type InsertableTreeNodeFromImplicitAllowedTypesUnsafe<
	TSchema extends Unenforced<ImplicitAllowedTypes>,
> = TSchema extends AllowedTypes
	? InsertableTypedNodeUnsafe<FlexListToUnion<TSchema>>
	: InsertableTypedNodeUnsafe<TSchema>;

/**
 * {@link Unenforced} version of {@link InsertableTypedNode}.
 * @public
 */
export type InsertableTypedNodeUnsafe<T extends Unenforced<TreeNodeSchema>> =
	| Unhydrated<NodeFromSchemaUnsafe<T>>
	| (T extends { implicitlyConstructable: true } ? NodeBuilderDataUnsafe<T> : never);

/**
 * {@link Unenforced} version of {@link NodeFromSchema}.
 * @public
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
 * @public
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
 * @public
 */
export interface TreeArrayNodeUnsafe<TAllowedTypes extends Unenforced<ImplicitAllowedTypes>>
	extends TreeArrayNodeBase<
		TreeNodeFromImplicitAllowedTypesUnsafe<TAllowedTypes>,
		InsertableTreeNodeFromImplicitAllowedTypesUnsafe<TAllowedTypes>,
		TreeArrayNode
	> {}

/**
 * {@link Unenforced} version of {@link TreeMapNode}.
 * @public
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
 * @public
 */
export type InsertableObjectFromSchemaRecordUnsafe<
	T extends Unenforced<RestrictiveReadonlyRecord<string, ImplicitFieldSchema>>,
> = {
	readonly [Property in keyof T]: InsertableTreeFieldFromImplicitFieldUnsafe<T[Property]>;
};

/**
 * {@link Unenforced} version of {@link InsertableTreeFieldFromImplicitField}.
 * @public
 */
export type InsertableTreeFieldFromImplicitFieldUnsafe<
	TSchema extends Unenforced<ImplicitFieldSchema>,
> = TSchema extends FieldSchemaUnsafe<infer Kind, infer Types>
	? ApplyKind<InsertableTreeNodeFromImplicitAllowedTypesUnsafe<Types>, Kind, true>
	: InsertableTreeNodeFromImplicitAllowedTypesUnsafe<TSchema>;

/**
 * {@link Unenforced} version of {@link FieldSchema}.
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
