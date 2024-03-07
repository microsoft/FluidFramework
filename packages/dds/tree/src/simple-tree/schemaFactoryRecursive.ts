/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import {
	FlexListToUnion,
	FlexTreeNode,
	Unenforced,
	isFlexTreeNode,
} from "../feature-libraries/index.js";
import { RestrictiveReadonlyRecord } from "../util/index.js";
import {
	AllowedTypes,
	ApplyKind,
	FieldKind,
	FieldSchema,
	ImplicitAllowedTypes,
	ImplicitFieldSchema,
	InsertableTreeNodeFromImplicitAllowedTypes,
	NodeFromSchema,
	NodeKind,
	TreeNodeFromImplicitAllowedTypes,
	TreeNodeSchema,
	TreeNodeSchemaClass,
	WithType,
} from "./schemaTypes.js";
import { SchemaFactory, type ScopedSchemaName } from "./schemaFactory.js";
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
 * @internal
 */
export type ObjectFromSchemaRecordUnsafe<
	T extends Unenforced<RestrictiveReadonlyRecord<string, ImplicitFieldSchema>>,
> = {
	-readonly [Property in keyof T]: TreeFieldFromImplicitFieldUnsafe<T[Property]>;
};

/**
 * {@link Unenforced} version of {@link TreeFieldFromImplicitField}.
 * @internal
 */
export type TreeFieldFromImplicitFieldUnsafe<TSchema extends Unenforced<ImplicitFieldSchema>> =
	TSchema extends FieldSchemaUnsafe<infer Kind, infer Types>
		? ApplyKind<TreeNodeFromImplicitAllowedTypesUnsafe<Types>, Kind>
		: TSchema extends ImplicitAllowedTypes
		? TreeNodeFromImplicitAllowedTypesUnsafe<TSchema>
		: unknown;

/**
 * {@link Unenforced} version of {@link TreeNodeFromImplicitAllowedTypes}.
 * @internal
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
 * @internal
 */
export type InsertableTreeNodeFromImplicitAllowedTypesUnsafe<
	TSchema extends Unenforced<ImplicitAllowedTypes>,
> = TSchema extends AllowedTypes
	? InsertableTypedNodeUnsafe<FlexListToUnion<TSchema>>
	: InsertableTypedNodeUnsafe<TSchema>;

/**
 * {@link Unenforced} version of {@link InsertableTypedNode}.
 * @internal
 */
export type InsertableTypedNodeUnsafe<T extends Unenforced<TreeNodeSchema>> =
	| Unhydrated<NodeFromSchemaUnsafe<T>>
	| (T extends { implicitlyConstructable: true } ? NodeBuilderDataUnsafe<T> : never);

/**
 * {@link Unenforced} version of {@link NodeFromSchema}.
 * @internal
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
 * @internal
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
 * @internal
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
 * @internal
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
 * @internal
 */
export type InsertableObjectFromSchemaRecordUnsafe<
	T extends Unenforced<RestrictiveReadonlyRecord<string, ImplicitFieldSchema>>,
> = {
	readonly [Property in keyof T]: InsertableTreeFieldFromImplicitFieldUnsafe<T[Property]>;
};

/**
 * {@link Unenforced} version of {@link InsertableTreeFieldFromImplicitField}.
 * @internal
 */
export type InsertableTreeFieldFromImplicitFieldUnsafe<
	TSchema extends Unenforced<ImplicitFieldSchema>,
> = TSchema extends FieldSchemaUnsafe<infer Kind, infer Types>
	? ApplyKind<InsertableTreeNodeFromImplicitAllowedTypesUnsafe<Types>, Kind>
	: InsertableTreeNodeFromImplicitAllowedTypesUnsafe<TSchema>;

/**
 * {@link Unenforced} version of {@link FieldSchema}.
 * @internal
 */
export interface FieldSchemaUnsafe<
	out Kind extends FieldKind,
	out Types extends Unenforced<ImplicitAllowedTypes>,
> {
	readonly kind: Kind;
	readonly allowedTypes: Types;
}

export function createFieldSchemaUnsafe<
	Kind extends FieldKind,
	Types extends Unenforced<ImplicitAllowedTypes>,
>(kind: Kind, allowedTypes: Types): FieldSchemaUnsafe<Kind, Types> {
	// At runtime, we still want this to be a FieldSchema instance, but we can't satisfy its extends clause, so just return it as an FieldSchemaUnsafe
	return new FieldSchema(kind, allowedTypes as ImplicitAllowedTypes) as FieldSchemaUnsafe<
		Kind,
		Types
	>;
}

/**
 * Extends SchemaFactory with utilities for recursive types.
 *
 * @remarks This is separated from SchemaFactory as these APIs are more experimental, and may be stabilized independently.
 *
 * @sealed @internal
 */
export class SchemaFactoryRecursive<
	TScope extends string,
	TName extends number | string = string,
> extends SchemaFactory<TScope, TName> {
	/**
	 * {@link SchemaFactory.object} except tweaked to work better for recursive types.
	 * @remarks
	 * This version of {@link SchemaFactory.object} has fewer type constraints to work around TypeScript limitations, see {@link Unenforced}.
	 */
	public objectRecursive<
		const Name extends TName,
		const T extends Unenforced<RestrictiveReadonlyRecord<string, ImplicitFieldSchema>>,
	>(name: Name, t: T) {
		return this.object(
			name,
			t as T & RestrictiveReadonlyRecord<string, ImplicitFieldSchema>,
		) as unknown as TreeNodeSchemaClass<
			ScopedSchemaName<TScope, Name>,
			NodeKind.Object,
			TreeNode & ObjectFromSchemaRecordUnsafe<T> & WithType<ScopedSchemaName<TScope, Name>>,
			object & InsertableObjectFromSchemaRecordUnsafe<T>,
			false,
			T
		>;
	}

	/**
	 * {@link SchemaFactory.optional} except tweaked to work better for recursive types.
	 * @remarks
	 * This version of {@link SchemaFactory.optional} has fewer type constraints to work around TypeScript limitations, see {@link Unenforced}.
	 */
	public optionalRecursive<const T extends Unenforced<readonly (() => TreeNodeSchema)[]>>(t: T) {
		return createFieldSchemaUnsafe(FieldKind.Optional, t);
	}

	/**
	 * `SchemaFactory.array` except tweaked to work better for recursive types.
	 * @remarks
	 * This version of `SchemaFactory.array` has fewer type constraints to work around TypeScript limitations, see {@link Unenforced}.
	 *
	 * Additionally `ImplicitlyConstructable` is disabled (forcing use of constructor) to avoid
	 * `error TS2589: Type instantiation is excessively deep and possibly infinite.`
	 * which otherwise gets reported at sometimes incorrect source locations that vary based on incremental builds.
	 */
	public arrayRecursive<
		const Name extends TName,
		const T extends Unenforced<ImplicitAllowedTypes>,
	>(name: Name, allowedTypes: T) {
		class RecursiveArray extends this.namedArray_internal(
			name,
			allowedTypes as T & ImplicitAllowedTypes,
			true,
			false,
		) {
			public constructor(
				data:
					| Iterable<InsertableTreeNodeFromImplicitAllowedTypes<T & ImplicitAllowedTypes>>
					| FlexTreeNode,
			) {
				if (isFlexTreeNode(data)) {
					super(data as any);
				} else {
					super(data);
				}
			}
		}

		return RecursiveArray as TreeNodeSchemaClass<
			ScopedSchemaName<TScope, Name>,
			NodeKind.Array,
			TreeArrayNodeUnsafe<T> & WithType<ScopedSchemaName<TScope, Name>>,
			{
				/**
				 * Iterator for the iterable of content for this node.
				 * @privateRemarks
				 * Wrapping the constructor parameter for recursive arrays and maps in an inlined object type avoids (for unknown reasons)
				 * the following compile error when declaring the recursive schema:
				 * `Function implicitly has return type 'any' because it does not have a return type annotation and is referenced directly or indirectly in one of its return expressions.`
				 * To benefit from this without impacting the API, the definition of `Iterable` has been inlined as such an object.
				 *
				 * If this workaround is kept, ideally this comment would be deduplicated with the other instance of it.
				 * Unfortunately attempts to do this failed to avoid the compile error this was introduced to solve.
				 */
				[Symbol.iterator](): Iterator<InsertableTreeNodeFromImplicitAllowedTypesUnsafe<T>>;
			},
			false
		>;
	}

	/**
	 * `SchemaFactory.map` except tweaked to work better for recursive types.
	 * @remarks
	 * This version of `SchemaFactory.map` uses the same workarounds as {@link SchemaFactoryRecursive.arrayRecursive}
	 */
	public mapRecursive<Name extends TName, const T extends Unenforced<ImplicitAllowedTypes>>(
		name: Name,
		allowedTypes: T,
	) {
		class MapSchema extends this.namedMap_internal(
			name,
			allowedTypes as T & ImplicitAllowedTypes,
			true,
			false,
		) {
			public constructor(
				data:
					| Iterable<
							[
								string,
								InsertableTreeNodeFromImplicitAllowedTypes<
									T & ImplicitAllowedTypes
								>,
							]
					  >
					| FlexTreeNode,
			) {
				if (isFlexTreeNode(data)) {
					super(data as any);
				} else {
					super(new Map(data));
				}
			}
		}

		return MapSchema as TreeNodeSchemaClass<
			ScopedSchemaName<TScope, Name>,
			NodeKind.Map,
			TreeMapNodeUnsafe<T> & WithType<ScopedSchemaName<TScope, Name>>,
			{
				/**
				 * Iterator for the iterable of content for this node.
				 * @privateRemarks
				 * Wrapping the constructor parameter for recursive arrays and maps in an inlined object type avoids (for unknown reasons)
				 * the following compile error when declaring the recursive schema:
				 * `Function implicitly has return type 'any' because it does not have a return type annotation and is referenced directly or indirectly in one of its return expressions.`
				 * To benefit from this without impacting the API, the definition of `Iterable` has been inlined as such an object.
				 *
				 * If this workaround is kept, ideally this comment would be deduplicated with the other instance of it.
				 * Unfortunately attempts to do this failed to avoid the compile error this was introduced to solve.
				 */
				[Symbol.iterator](): Iterator<
					[string, InsertableTreeNodeFromImplicitAllowedTypesUnsafe<T>]
				>;
			},
			false
		>;
	}
}
