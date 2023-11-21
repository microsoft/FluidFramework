/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { TreeValue } from "../core";
import { RestrictiveReadonlyRecord } from "../util";
import {
	FieldKind,
	FieldKinds,
	AllowedTypes,
	Any,
	FieldNodeSchema,
	TreeFieldSchema,
	InternalTypedSchemaTypes,
	LeafNodeSchema,
	MapNodeSchema,
	ObjectNodeSchema,
	TreeNodeSchema,
	TreeSchema,
	AssignableFieldKinds,
} from "../feature-libraries";
import { IterableTreeListContent, createIterableTreeListContent } from "./iterableTreeListContent";

/**
 * A non-{@link LeafNodeSchema|leaf} SharedTree node. Includes objects, lists, and maps.
 *
 * @privateRemarks
 * This is a union of all possible tree node types.
 * Since the tree node types are not covariant over their schema, the fact that this works is non-trivial.
 * TODO: Type tests to ensure that various tree node types are actually assignable to this.
 *
 * Using default parameters, this could be combined with TypedNode.
 * @alpha
 */
export type TreeNode = TreeListNode | TreeObjectNode<ObjectNodeSchema> | TreeMapNode<MapNodeSchema>;

/**
 * A {@link TreeNode} which implements 'readonly T[]' and the list mutation APIs.
 * @alpha
 */
export interface TreeListNode<out TTypes extends AllowedTypes = AllowedTypes>
	extends TreeListNodeBase<
		TreeNodeUnion<TTypes>,
		TreeNodeUnion<TTypes, "javaScript">,
		TreeListNode
	> {}

/**
 * A {@link TreeNode} which implements 'readonly T[]' and the list mutation APIs.
 * @alpha
 */
export const TreeListNode = {
	/**
	 * Wrap an iterable of content to be inserted into a list.
	 * @remarks
	 * The object returned by this function can be inserted into a list as an element.
	 * Its contents will be inserted sequentially in the corresponding location in the list.
	 * @example
	 * ```ts
	 * list.insertAtEnd(list.inline(iterable))
	 * ```
	 */
	inline: <T>(content: Iterable<T>) => createIterableTreeListContent(content),
};

/**
 * A generic List type, used to defined types like {@link (TreeListNode:interface)}.
 * @alpha
 */
export interface TreeListNodeBase<out T, in TNew, in TMoveFrom> extends ReadonlyArray<T> {
	/**
	 * Inserts new item(s) at a specified location.
	 * @param index - The index at which to insert `value`.
	 * @param value - The content to insert.
	 * @throws Throws if `index` is not in the range [0, `list.length`).
	 */
	insertAt(index: number, ...value: (TNew | IterableTreeListContent<TNew>)[]): void;

	/**
	 * Inserts new item(s) at the start of the list.
	 * @param value - The content to insert.
	 */
	insertAtStart(...value: (TNew | IterableTreeListContent<TNew>)[]): void;

	/**
	 * Inserts new item(s) at the end of the list.
	 * @param value - The content to insert.
	 */
	insertAtEnd(...value: (TNew | IterableTreeListContent<TNew>)[]): void;

	/**
	 * Removes the item at the specified location.
	 * @param index - The index at which to remove the item.
	 * @throws Throws if `index` is not in the range [0, `list.length`).
	 */
	removeAt(index: number): void;

	/**
	 * Removes all items between the specified indices.
	 * @param start - The starting index of the range to remove (inclusive). Defaults to the start of the list.
	 * @param end - The ending index of the range to remove (exclusive).
	 * @throws Throws if `start` is not in the range [0, `list.length`).
	 * @throws Throws if `end` is less than `start`.
	 * If `end` is not supplied or is greater than the length of the list, all items after `start` are deleted.
	 */
	removeRange(start?: number, end?: number): void;

	/**
	 * Moves the specified item to the start of the list.
	 * @param sourceIndex - The index of the item to move.
	 * @throws Throws if `sourceIndex` is not in the range [0, `list.length`).
	 */
	moveToStart(sourceIndex: number): void;

	/**
	 * Moves the specified item to the start of the list.
	 * @param sourceIndex - The index of the item to move.
	 * @param source - The source list to move the item out of.
	 * @throws Throws if `sourceIndex` is not in the range [0, `list.length`).
	 */
	moveToStart(sourceIndex: number, source: TMoveFrom): void;

	/**
	 * Moves the specified item to the end of the list.
	 * @param sourceIndex - The index of the item to move.
	 * @throws Throws if `sourceIndex` is not in the range [0, `list.length`).
	 */
	moveToEnd(sourceIndex: number): void;

	/**
	 * Moves the specified item to the end of the list.
	 * @param sourceIndex - The index of the item to move.
	 * @param source - The source list to move the item out of.
	 * @throws Throws if `sourceIndex` is not in the range [0, `list.length`).
	 */
	moveToEnd(sourceIndex: number, source: TMoveFrom): void;

	/**
	 * Moves the specified item to the desired location in the list.
	 * @param index - The index to move the item to.
	 * This is based on the state of the list before moving the source item.
	 * @param sourceIndex - The index of the item to move.
	 * @throws Throws if any of the input indices are not in the range [0, `list.length`).
	 */
	moveToIndex(index: number, sourceIndex: number): void;

	/**
	 * Moves the specified item to the desired location in the list.
	 * @param index - The index to move the item to.
	 * @param sourceIndex - The index of the item to move.
	 * @param source - The source list to move the item out of.
	 * @throws Throws if any of the input indices are not in the range [0, `list.length`).
	 */
	moveToIndex(index: number, sourceIndex: number, source: TMoveFrom): void;

	/**
	 * Moves the specified items to the start of the list.
	 * @param sourceStart - The starting index of the range to move (inclusive).
	 * @param sourceEnd - The ending index of the range to move (exclusive)
	 * @throws Throws if either of the input indices are not in the range [0, `list.length`) or if `sourceStart` is greater than `sourceEnd`.
	 */
	moveRangeToStart(sourceStart: number, sourceEnd: number): void;

	/**
	 * Moves the specified items to the start of the list.
	 * @param sourceStart - The starting index of the range to move (inclusive).
	 * @param sourceEnd - The ending index of the range to move (exclusive)
	 * @param source - The source list to move items out of.
	 * @throws Throws if the types of any of the items being moved are not allowed in the destination list,
	 * if either of the input indices are not in the range [0, `list.length`) or if `sourceStart` is greater than `sourceEnd`.
	 */
	moveRangeToStart(sourceStart: number, sourceEnd: number, source: TMoveFrom): void;

	/**
	 * Moves the specified items to the end of the list.
	 * @param sourceStart - The starting index of the range to move (inclusive).
	 * @param sourceEnd - The ending index of the range to move (exclusive)
	 * @throws Throws if either of the input indices are not in the range [0, `list.length`) or if `sourceStart` is greater than `sourceEnd`.
	 */
	moveRangeToEnd(sourceStart: number, sourceEnd: number): void;

	/**
	 * Moves the specified items to the end of the list.
	 * @param sourceStart - The starting index of the range to move (inclusive).
	 * @param sourceEnd - The ending index of the range to move (exclusive)
	 * @param source - The source list to move items out of.
	 * @throws Throws if the types of any of the items being moved are not allowed in the destination list,
	 * if either of the input indices are not in the range [0, `list.length`) or if `sourceStart` is greater than `sourceEnd`.
	 */
	moveRangeToEnd(sourceStart: number, sourceEnd: number, source: TMoveFrom): void;

	/**
	 * Moves the specified items to the desired location within the list.
	 * @param index - The index to move the items to.
	 * This is based on the state of the list before moving the source items.
	 * @param sourceStart - The starting index of the range to move (inclusive).
	 * @param sourceEnd - The ending index of the range to move (exclusive)
	 * @throws Throws if any of the input indices are not in the range [0, `list.length`) or if `sourceStart` is greater than `sourceEnd`.
	 */
	moveRangeToIndex(index: number, sourceStart: number, sourceEnd: number): void;

	/**
	 * Moves the specified items to the desired location within the list.
	 * @param index - The index to move the items to.
	 * @param sourceStart - The starting index of the range to move (inclusive).
	 * @param sourceEnd - The ending index of the range to move (exclusive)
	 * @param source - The source list to move items out of.
	 * @throws Throws if the types of any of the items being moved are not allowed in the destination list,
	 * if any of the input indices are not in the range [0, `list.length`) or if `sourceStart` is greater than `sourceEnd`.
	 */
	moveRangeToIndex(
		index: number,
		sourceStart: number,
		sourceEnd: number,
		source: TMoveFrom,
	): void;
}

/**
 * An object which supports property-based access to fields.
 * @alpha
 */
export type TreeObjectNode<
	TSchema extends ObjectNodeSchema,
	API extends "javaScript" | "sharedTree" = "sharedTree",
> = TreeObjectNodeFields<TSchema["objectNodeFieldsObject"], API>;

/**
 * Helper for generating the properties of a {@link TreeObjectNode}.
 * @privateRemarks
 * This type is composed of four subtypes for each mutually exclusive combination of "readonly" and "optional".
 * If it were possible to map to getters and setters separately, the "readonly" cases would collapse, but this is not currently a feature in TS.
 * See https://github.com/microsoft/TypeScript/issues/43826 for more details on this limitation.
 * @alpha
 */
export type TreeObjectNodeFields<
	TFields extends RestrictiveReadonlyRecord<string, TreeFieldSchema>,
	API extends "javaScript" | "sharedTree" = "sharedTree",
> = {
	// Filter for properties that are both assignable and optional; mark them `-readonly` and `?`.
	-readonly [key in keyof TFields as TFields[key]["kind"] extends AssignableFieldKinds
		? TFields[key]["kind"] extends typeof FieldKinds.optional
			? key
			: never
		: never]?: TreeField<TFields[key], API>;
} & {
	// Filter for properties that are assignable but are optional; mark them `-readonly` and `-?`.
	-readonly [key in keyof TFields as TFields[key]["kind"] extends AssignableFieldKinds
		? TFields[key]["kind"] extends typeof FieldKinds.optional
			? never
			: key
		: never]-?: TreeField<TFields[key], API>;
} & {
	// Filter for properties that are not assignable but are optional; mark them `readonly` and `?`.
	readonly [key in keyof TFields as TFields[key]["kind"] extends AssignableFieldKinds
		? never
		: TFields[key]["kind"] extends typeof FieldKinds.optional
		? key
		: never]?: TreeField<TFields[key], API>;
} & {
	// Filter for properties that are not assignable and are not optional; mark them `readonly` and `-?`.
	readonly [key in keyof TFields as TFields[key]["kind"] extends AssignableFieldKinds
		? never
		: TFields[key]["kind"] extends typeof FieldKinds.optional
		? never
		: key]-?: TreeField<TFields[key], API>;
};

/**
 * A map of string keys to tree objects.
 *
 * @privateRemarks
 * Add support for `clear` once we have established merge semantics for it.
 *
 * @alpha
 */
export interface TreeMapNode<TSchema extends MapNodeSchema>
	extends ReadonlyMap<string, TreeField<TSchema["info"], "sharedTree", "notEmpty">> {
	/**
	 * Adds or updates an entry in the map with a specified `key` and a `value`.
	 *
	 * @param key - The key of the element to add to the map.
	 * @param value - The value of the element to add to the map.
	 *
	 * @remarks
	 * Setting the value at a key to `undefined` is equivalent to calling {@link TreeMapNode.delete} with that key.
	 */
	set(key: string, value: TreeField<TSchema["info"], "sharedTree", "notEmpty"> | undefined): void;

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
}

/**
 * Given a field's schema, return the corresponding object in the proxy-based API.
 * @alpha
 */
export type TreeField<
	TSchema extends TreeFieldSchema = TreeFieldSchema,
	API extends "javaScript" | "sharedTree" = "sharedTree",
	// If "notEmpty", then optional fields will unbox to their content (not their content | undefined)
	Emptiness extends "maybeEmpty" | "notEmpty" = "maybeEmpty",
> = TreeFieldInner<TSchema["kind"], TSchema["allowedTypes"], API, Emptiness>;

/**
 * Helper for implementing {@link InternalEditableTreeTypes#ProxyField}.
 * @alpha
 */
export type TreeFieldInner<
	Kind extends FieldKind,
	TTypes extends AllowedTypes,
	API extends "javaScript" | "sharedTree",
	Emptiness extends "maybeEmpty" | "notEmpty",
> = Kind extends typeof FieldKinds.sequence
	? never // Sequences are only supported underneath FieldNodes. See FieldNode case in `ProxyNode`.
	: Kind extends typeof FieldKinds.required
	? TreeNodeUnion<TTypes, API>
	: Kind extends typeof FieldKinds.optional
	? TreeNodeUnion<TTypes, API> | (Emptiness extends "notEmpty" ? never : undefined)
	: unknown;

/**
 * Given multiple node schema types, return the corresponding object type union in the proxy-based API.
 * @alpha
 */
export type TreeNodeUnion<
	TTypes extends AllowedTypes,
	API extends "javaScript" | "sharedTree" = "sharedTree",
> = TTypes extends readonly [Any]
	? unknown
	: {
			// TODO: Is the the best way to write this type function? Can it be simplified?
			// This first maps the tuple of AllowedTypes to a tuple of node API types.
			// Then, it uses [number] to index arbitrarily into that tuple, effectively converting the type tuple into a type union.
			[Index in keyof TTypes]: TTypes[Index] extends InternalTypedSchemaTypes.LazyItem<
				infer InnerType
			>
				? InnerType extends TreeNodeSchema
					? TypedNode<InnerType, API>
					: never
				: never;
	  }[number];

/**
 * Given a node's schema, return the corresponding object in the proxy-based API.
 * @alpha
 */
export type TypedNode<
	TSchema extends TreeNodeSchema,
	API extends "javaScript" | "sharedTree" = "sharedTree",
> = TSchema extends LeafNodeSchema
	? TreeValue<TSchema["info"]>
	: TSchema extends MapNodeSchema
	? API extends "sharedTree"
		? TreeMapNode<TSchema>
		: ReadonlyMap<string, TreeField<TSchema["info"], API>>
	: TSchema extends FieldNodeSchema
	? API extends "sharedTree"
		? TreeListNode<TSchema["info"]["allowedTypes"]>
		: readonly TreeNodeUnion<TSchema["info"]["allowedTypes"], API>[]
	: TSchema extends ObjectNodeSchema
	? TreeObjectNode<TSchema, API>
	: // TODO: this should be able to be replaced with `TreeNode` to provide stronger typing in some edge cases, like TypedNode<TreeNodeSchema>
	  unknown;

/**
 * The root type (the type of the entire tree) for a given schema collection.
 * */
export type TreeRoot<
	TSchema extends TreeSchema,
	API extends "javaScript" | "sharedTree" = "sharedTree",
> = TSchema extends TreeSchema<infer TRootFieldSchema> ? TreeField<TRootFieldSchema, API> : never;
