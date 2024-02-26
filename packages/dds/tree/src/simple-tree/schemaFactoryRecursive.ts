/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { FlexTreeNode, isFlexTreeNode } from "../feature-libraries/index.js";
import { RestrictiveReadonlyRecord } from "../util/index.js";
import {
	ImplicitAllowedTypes,
	ImplicitFieldSchema,
	InsertableObjectFromSchemaRecord,
	InsertableTreeNodeFromImplicitAllowedTypes,
	NodeKind,
	ObjectFromSchemaRecord,
	TreeMapNode,
	TreeNodeSchemaClass,
	WithType,
} from "./schemaTypes.js";
import { SchemaFactory, type ScopedSchemaName } from "./schemaFactory.js";
import { TreeArrayNode } from "./treeArrayNode.js";

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
	 * For unknown reasons, recursive objects work better (compile in more cases)
	 * if they their insertable types and node types are not required to be an object.
	 * This reduces type safety a bit, but is worth it to make the recursive types actually work at all.
	 */
	public objectRecursive<
		const Name extends TName,
		const T extends RestrictiveReadonlyRecord<string, ImplicitFieldSchema>,
	>(
		name: Name,
		t: T,
	): TreeNodeSchemaClass<
		ScopedSchemaName<TScope, Name>,
		NodeKind.Object,
		ObjectFromSchemaRecord<T> & WithType<ScopedSchemaName<TScope, Name>>,
		InsertableObjectFromSchemaRecord<T>,
		true
	> {
		return this.object(name, t);
	}

	/**
	 * For unknown reasons, recursive arrays work better (compile in more cases)
	 * if their constructor takes in an object with a member containing the iterable,
	 * rather than taking the iterable as a parameter directly.
	 *
	 * This version of `array` leverages this fact, and has a constructor that requires its data be passed in like:
	 * ```typescript
	 * new MyRecursiveArray({x: theData});
	 * ```
	 */
	public arrayRecursive<const Name extends TName, const T extends ImplicitAllowedTypes>(
		name: Name,
		allowedTypes: T,
	) {
		class RecursiveArray extends this.namedArray_internal(name, allowedTypes, true, false) {
			public constructor(
				data: { x: Iterable<InsertableTreeNodeFromImplicitAllowedTypes<T>> } | FlexTreeNode,
			) {
				if (isFlexTreeNode(data)) {
					super(data as any);
				} else {
					super(data.x);
				}
			}
		}

		return RecursiveArray as unknown as TreeNodeSchemaClass<
			`${TScope}.${string}`,
			NodeKind.Array,
			TreeArrayNode<T> & WithType<`${TScope}.${string}`>,
			{ x: Iterable<InsertableTreeNodeFromImplicitAllowedTypes<T>> },
			false
		>;
	}

	/**
	 * For unknown reasons, recursive maps work better (compile in more cases)
	 * if their constructor does not take in the desired type.
	 *
	 * This version of `map` leverages this fact and takes in undefined instead.
	 * Unfortunately this means all maps created this way must be created empty then filled later.
	 * @privateRemarks
	 * TODO:
	 * Figure out a way to make recursive prefilled maps work.
	 */
	public mapRecursive<Name extends TName, const T extends ImplicitAllowedTypes>(
		name: Name,
		allowedTypes: T,
	) {
		class MapSchema extends this.namedMap_internal(name, allowedTypes, true, false) {
			public constructor(data?: undefined | FlexTreeNode) {
				if (isFlexTreeNode(data)) {
					super(data as any);
				} else {
					super(new Map());
				}
			}
		}

		return MapSchema as TreeNodeSchemaClass<
			`${TScope}.${Name}`,
			NodeKind.Map,
			TreeMapNode<T> & WithType<`${TScope}.${Name}`>,
			undefined,
			false
		>;
	}
}
