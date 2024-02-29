/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import {
	FlexFieldNodeSchema,
	FlexListToUnion,
	FlexMapNodeSchema,
	FlexObjectNodeSchema,
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
// TSchema extends any[] ? TypedNodeUnsafe<FlexListToUnion<TSchema>> : TypedNodeUnsafe<TSchema>;

/**
 * {@link Unenforced} version of `TypedNode`.
 * @internal
 */
export type TypedNodeUnsafe<
	_TSchema extends Unenforced<FlexObjectNodeSchema | FlexFieldNodeSchema | FlexMapNodeSchema>,
> = TreeNode & WithType; // <TSchema["name"]>;

/**
 * {@link Unenforced} version of {@link InsertableTreeNodeFromImplicitAllowedTypes}.
 * @internal
 */
// export type InsertableTreeNodeFromImplicitAllowedTypesUnsafe<
// 	TSchema extends Unenforced<ImplicitAllowedTypes>,
// > = TSchema extends TreeNodeSchema
// 	? InsertableTypedNode<TSchema>
// 	: TSchema extends AllowedTypes
// 	? InsertableTypedNode<FlexListToUnion<TSchema>>
// 	: never;

/**
 * {@link Unenforced} version2 of {@link InsertableTreeNodeFromImplicitAllowedTypes}.
 * @internal
 */
export type InsertableTreeNodeFromImplicitAllowedTypesUnsafe<
	TSchema extends Unenforced<ImplicitAllowedTypes>,
> = TSchema extends AllowedTypes
	? InsertableTypedNodeUnsafe<FlexListToUnion<TSchema>> // TODO
	: InsertableTypedNodeUnsafe<TSchema>; // TODO

/**
 * {@link Unenforced} version of {@link InsertableTypedNode}.
 * @internal
 * @privateRemarks
 * Implicit construction under a recursive node is having issues in some cases, so its disabled for now to avoid stabilizing it at all.
 * TODO: In the future consider changing this to use "InsertableTypedNodeUnsafe", and fix issues with implicit construction.
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

	public optionalRecursive<const T extends Unenforced<readonly (() => TreeNodeSchema)[]>>(t: T) {
		return createFieldSchemaUnsafe(FieldKind.Optional, t);
	}

	/**
	 * `SchemaFactory.array` except tweaked to work better for recursive types.
	 * @remarks
	 * This version of `SchemaFactory.array` has fewer type constraints to work around TypeScript limitations, see {@link Unenforced}.
	 *
	 * For unknown reasons, recursive arrays avoid `error TS2577: Return type annotation circularly references itself.`
	 * if their constructor takes in an object with a member containing the iterable,
	 * rather than taking the iterable as a parameter directly.
	 *
	 * This version of `array` leverages this fact, and has a constructor that requires its data be passed in like:
	 * ```typescript
	 * new MyRecursiveArray({x: theData});
	 * ```
	 *
	 * Additionally `ImplicitlyConstructable` is disabled (forcing use of constructor) to avoid
	 * `error TS2589: Type instantiation is excessively deep and possibly infinite.`
	 * which gets reported at sometimes incorrect source locations that vary based on incremental builds.
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
					| {
							x: Iterable<
								InsertableTreeNodeFromImplicitAllowedTypes<T & ImplicitAllowedTypes>
							>;
					  }
					| FlexTreeNode,
			) {
				if (isFlexTreeNode(data)) {
					super(data as any);
				} else {
					super(data.x);
				}
			}
		}

		return RecursiveArray as unknown as TreeNodeSchemaClass<
			ScopedSchemaName<TScope, Name>,
			NodeKind.Array,
			TreeArrayNodeUnsafe<T> & WithType<ScopedSchemaName<TScope, Name>>,
			{ x: Iterable<InsertableTreeNodeFromImplicitAllowedTypesUnsafe<T>> },
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
				data?:
					| {
							x: Iterable<
								[
									string,
									InsertableTreeNodeFromImplicitAllowedTypes<
										T & ImplicitAllowedTypes
									>,
								]
							>;
					  }
					| FlexTreeNode,
			) {
				if (isFlexTreeNode(data)) {
					super(data as any);
				} else {
					super(new Map(data?.x ?? []));
				}
			}
		}

		return MapSchema as TreeNodeSchemaClass<
			ScopedSchemaName<TScope, Name>,
			NodeKind.Map,
			TreeMapNodeUnsafe<T> & WithType<ScopedSchemaName<TScope, Name>>,
			| undefined
			| { x: Iterable<[string, InsertableTreeNodeFromImplicitAllowedTypesUnsafe<T>]> },
			false
		>;
	}
}
