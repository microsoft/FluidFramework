/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { TreeListNode } from "../simple-tree";
import { FlexTreeNode, isFlexTreeNode } from "../feature-libraries";
import {
	ImplicitAllowedTypes,
	InsertableTreeNodeFromImplicitAllowedTypes,
	NodeKind,
	TreeMapNode,
	TreeNodeFromImplicitAllowedTypes,
	TreeNodeSchemaClass,
} from "./schemaTypes";
import { SchemaFactory } from "./schemaFactory";

/**
 * Extends SchemaFactory with utilities for recursive types.
 *
 * This is separated from SchemaFactory as these APIs are more experimental, and may be stabilized independently.
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
	public listRecursive<const Name extends TName, const T extends ImplicitAllowedTypes>(
		name: Name,
		allowedTypes: T,
	) {
		class List extends this.namedList(name, allowedTypes, true, false) {
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

		return List as unknown as TreeNodeSchemaClass<
			`${TScope}.${string}`,
			NodeKind.List,
			TreeListNode<T>,
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

// eslint-disable-next-line @typescript-eslint/consistent-type-definitions
export type Mappy<T extends ImplicitAllowedTypes> = {
	/**
	 * Adds or updates an entry in the map with a specified `key` and a `value`.
	 *
	 * @param key - The key of the element to add to the map.
	 * @param value - The value of the element to add to the map.
	 *
	 * @remarks
	 * Setting the value at a key to `undefined` is equivalent to calling {@link TreeMapNodeBase.delete} with that key.
	 */
	set(key: string, value: InsertableTreeNodeFromImplicitAllowedTypes<T> | undefined): void;

	/**
	 * Removes the specified element from this map by its `key`.
	 *
	 * @remarks
	 * Note: unlike JavaScript's Map API, this method does not return a flag indicating whether or not the value was
	 * deleted.
	 *
	 * @privateRemarks
	 * Regarding the choice to not return a boolean: Since this data structure is distributed in nature, it isn't
	 * possible to tell whether or not the item was deleted as a result of this method call. Returning a "best guess"
	 * is more likely to create issues / promote bad usage patterns than offer useful information.
	 *
	 * @param key - The key of the element to remove from the map.
	 */
	delete(key: string): void;

	// For unknown reasons, inlining the contents of ReadonlyMap here fixes recursive types.

	/**
	 * Returns an iterable of keys in the map
	 */
	keys(): IterableIterator<string>;

	/**
	 * Returns an iterable of values in the map
	 */
	values(): IterableIterator<TreeNodeFromImplicitAllowedTypes<T>>;

	/** Returns an iterable of entries in the map. */
	[Symbol.iterator](): IterableIterator<[string, TreeNodeFromImplicitAllowedTypes<T>]>;

	/**
	 * Returns an iterable of key, value pairs for every entry in the map.
	 */
	entries(): IterableIterator<[string, TreeNodeFromImplicitAllowedTypes<T>]>;
};

// eslint-disable-next-line @typescript-eslint/consistent-type-definitions
export type Mappy2<T extends ImplicitAllowedTypes> = {
	/**
	 * Adds or updates an entry in the map with a specified `key` and a `value`.
	 *
	 * @param key - The key of the element to add to the map.
	 * @param value - The value of the element to add to the map.
	 *
	 * @remarks
	 * Setting the value at a key to `undefined` is equivalent to calling {@link TreeMapNodeBase.delete} with that key.
	 */
	set(key: string, value: TreeNodeFromImplicitAllowedTypes<T> | undefined): void;

	/**
	 * Removes the specified element from this map by its `key`.
	 *
	 * @remarks
	 * Note: unlike JavaScript's Map API, this method does not return a flag indicating whether or not the value was
	 * deleted.
	 *
	 * @privateRemarks
	 * Regarding the choice to not return a boolean: Since this data structure is distributed in nature, it isn't
	 * possible to tell whether or not the item was deleted as a result of this method call. Returning a "best guess"
	 * is more likely to create issues / promote bad usage patterns than offer useful information.
	 *
	 * @param key - The key of the element to remove from the map.
	 */
	delete(key: string): void;

	// For unknown reasons, inlining the contents of ReadonlyMap here fixes recursive types.

	/**
	 * Returns an iterable of keys in the map
	 */
	keys(): IterableIterator<string>;

	/**
	 * Returns an iterable of values in the map
	 */
	values(): IterableIterator<TreeNodeFromImplicitAllowedTypes<T>>;

	/** Returns an iterable of entries in the map. */
	[Symbol.iterator](): IterableIterator<[string, TreeNodeFromImplicitAllowedTypes<T>]>;

	/**
	 * Returns an iterable of key, value pairs for every entry in the map.
	 */
	entries(): IterableIterator<[string, TreeNodeFromImplicitAllowedTypes<T>]>;
};
