/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { FlexTreeNode, isFlexTreeNode } from "../feature-libraries";
import { TreeArrayNode } from "../simple-tree";
import {
	ImplicitAllowedTypes,
	InsertableTreeNodeFromImplicitAllowedTypes,
	NodeKind,
	TreeMapNode,
	TreeNodeSchemaClass,
} from "./schemaTypes";
import { SchemaFactory } from "./schemaFactory";

/**
 * Extends SchemaFactory with utilities for recursive types.
 *
 * @remarks This is separated from SchemaFactory as these APIs are more experimental, and may be stabilized independently.
 *
 * @sealed @alpha
 */
export class SchemaFactoryRecursive<
	TScope extends string,
	TName extends number | string = string,
> extends SchemaFactory<TScope, TName> {
	/**
	 * For unknown reasons, recursive lists work better (compile in more cases)
	 * if their constructor takes in an object with a member containing the iterable,
	 * rather than taking the iterable as a parameter directly.
	 *
	 * This version of `list` leverages this fact, and has a constructor that requires its data be passed in like:
	 * ```typescript
	 * new MyRecursiveList({x: theData});
	 * ```
	 */
	public arrayRecursive<const Name extends TName, const T extends ImplicitAllowedTypes>(
		name: Name,
		allowedTypes: T,
	) {
		class RecursiveArray extends this.namedArray(name, allowedTypes, true, false) {
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
			TreeArrayNode<T>,
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
		class MapSchema extends this.namedMap(name, allowedTypes, true, false) {
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
			TreeMapNode<T>,
			undefined,
			false
		>;
	}
}
