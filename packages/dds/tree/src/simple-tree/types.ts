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
	LeafNodeSchema,
	MapNodeSchema,
	ObjectNodeSchema,
	TreeNodeSchema,
	AssignableFieldKinds,
	LazyItem,
} from "../feature-libraries";
import { type NodeFromSchema, type TreeNodeSchema as TreeNodeSchemaClass } from "../class-tree";
// eslint-disable-next-line import/no-internal-modules
import { type, WithType } from "../class-tree/schemaTypes";
import { IterableTreeListContent, TreeListNodeOld } from "./treeListNode";
import { tryGetFlexNode } from "./flexNode";

/**
 * Type alias to document which values are un-hydrated.
 *
 * Un-hydrated values are nodes produced from schema's create functions that haven't been inserted into a tree yet.
 *
 * Since un-hydrated nodes become hydrated when inserted, strong typing can't be used to distinguish them.
 * This no-op wrapper is used instead.
 * @public
 */
export type Unhydrated<T> = T;

/**
 * A symbol for storing TreeNodeSchemaClass on FlexTreeNode's schema.
 */
export const simpleSchemaSymbol: unique symbol = Symbol(`simpleSchema`);

export function getClassSchema(schema: TreeNodeSchema): TreeNodeSchemaClass | undefined {
	if (simpleSchemaSymbol in schema) {
		return schema[simpleSchemaSymbol] as TreeNodeSchemaClass;
	}
	return undefined;
}

/**
 * A non-{@link LeafNodeSchema|leaf} SharedTree node. Includes objects, lists, and maps.
 * A non-leaf SharedTree node. Includes objects, lists, and maps.
 *
 * @remarks
 * Base type which all nodes implement.
 *
 * This can be used as a type to indicate/document values which should be tree nodes.
 * Runtime use of this class object (for example when subclassed), is not supported except for use with `instanceof`:
 * it may be replaced with an interface or union in the future (with `instanceof TreeNode` replaced with a free function).
 * @privateRemarks
 * Future changes may replace this with a branded interface if the runtime oddities related to this are not cleaned up.
 *
 * Currently not all node implications include this in their prototype chain (some hide it with a proxy), and thus cause `instanceof` to fail.
 * This results in the runtime and compile time behavior of `instanceof` differing.
 * TypeScript 5.3 allows altering the compile time behavior of `instanceof`.
 * The runtime behavior can be changed by implementing `Symbol.hasInstance`.
 * One of those approaches could be used to resolve this inconsistency if TreeNode is kept as a class.
 * @public
 */
export abstract class TreeNode implements WithType {
	/**
	 * This is added to prevent TypeScript from implicitly allowing non-TreeNode types to be used as TreeNodes.
	 * @privateRemarks
	 * This is a JavaScript private field, so is not accessible from outside this class.
	 * This prevents it from having name collisions with object fields.
	 * Since this is private, the type of this field is stripped in the d.ts file.
	 * To get matching type checking within and from outside the package, the least informative type (`unknown`) is used.
	 * To avoid this having any runtime impact, the field is uninitialized.
	 *
	 * Making this field optional results in different type checking within this project than outside of it, since the d.ts file drops the optional aspect of the field.
	 * This is extra confusing since sin ce the tests get in-project typing for intellisense and separate project checking at build time.
	 * To avoid all this mess, this field is required, not optional.
	 *
	 * Another option would be to use a symbol (possibly as a private field).
	 * That approach ran into some strange difficulties causing SchemaFactory to fail to compile, and was not investigated further.
	 *
	 * TODO: This is disabled due to compilation of this project not targeting es2022,
	 * which causes this to polyfill to use of a weak map which has some undesired runtime overhead.
	 * Consider enabling this for stronger typing after targeting es2022.
	 * The [type] symbol here provides a lot of the value this private brand would, but is not all of it:
	 * someone could manually make an object literal with it and pass it off as a node: this private brand would prevent that.
	 * Another option would be to add a protected or private symbol, which would also get the stronger typing.
	 */
	// readonly #brand!: unknown;

	/**
	 * {@inheritdoc "type"}
	 * @privateRemarks
	 * Subclasses provide more specific strings for this to get strong typing of otherwise type compatible nodes.
	 */
	public abstract get [type](): string;

	/**
	 * Provides `instancof` support for all tree nodes.
	 * @remarks
	 * This requires that the subclasses of TreeNode are all actually node types:
	 * to avoid breaking this, do not extend TreeNode other than via class based schema.
	 * @privateRemarks
	 * This overrides `instancof` for all subclasses of TreeNode to use a schema based approach.
	 * TypeScript 5.3 will impact how this does type narrowing, but it should continue to work correctly with that.
	 *
	 * TODO: once class-tree and simple-tree are merged, consider refactoring this to share logic with `Tree.is`.
	 */
	public static [Symbol.hasInstance]<
		TSchema extends typeof TreeNode & (abstract new (...args: any[]) => TreeNode),
	>(this: TSchema, value: unknown): value is InstanceType<TSchema>;

	/**
	 * Provides `instancof` support for all class based schema.
	 */
	public static [Symbol.hasInstance]<TSchema extends typeof TreeNode & TreeNodeSchemaClass>(
		this: TSchema,
		value: unknown,
	): value is NodeFromSchema<TSchema>;

	public static [Symbol.hasInstance]<TSchema extends typeof TreeNode & TreeNodeSchemaClass>(
		this: TSchema,
		value: unknown,
	): value is NodeFromSchema<TSchema> {
		const flexNode = tryGetFlexNode(value);
		if (flexNode === undefined) {
			return false;
		}

		const flexSchema = flexNode.schema;
		let schema: object | null | undefined = getClassSchema(flexSchema);

		if (schema === undefined) {
			// TODO: One legacy schema builder test ("objectRecursive") mixes simple tree APIs with objects with no class schema (made using flex schema only).
			// For now we return false for this cases instead of failing to allow that test to function.
			// fail("missing class schema for node");
			return false;
		}

		while (schema !== null) {
			if (this === schema) {
				return true;
			}
			schema = Reflect.getPrototypeOf(schema);
		}
		return false;
	}
}

/**
 * A generic List type, used to defined types like {@link (TreeArrayNode:interface)}.
 * @public
 */
export interface TreeArrayNodeBase<out T, in TNew, in TMoveFrom>
	extends ReadonlyArray<T>,
		TreeNode {
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
 */
export type TreeObjectNode<TSchema extends ObjectNodeSchema> = TreeNode &
	TreeObjectNodeFields<TSchema["objectNodeFieldsObject"]>;

/**
 * Helper for generating the properties of a {@link TreeObjectNode}.
 * @privateRemarks
 * This type is composed of four subtypes for each mutually exclusive combination of "readonly" and "optional".
 * If it were possible to map to getters and setters separately, the "readonly" cases would collapse, but this is not currently a feature in TS.
 * See https://github.com/microsoft/TypeScript/issues/43826 for more details on this limitation.
 */
export type TreeObjectNodeFields<
	TFields extends RestrictiveReadonlyRecord<string, TreeFieldSchema>,
> = {
	// Filter for properties that are both assignable and optional; mark them `-readonly` and `?`.
	-readonly [key in keyof TFields as TFields[key]["kind"] extends AssignableFieldKinds
		? TFields[key]["kind"] extends typeof FieldKinds.optional
			? key
			: never
		: never]?: TreeField<TFields[key]>;
} & {
	// Filter for properties that are assignable but are not optional; mark them `-readonly` and `-?`.
	-readonly [key in keyof TFields as TFields[key]["kind"] extends AssignableFieldKinds
		? TFields[key]["kind"] extends typeof FieldKinds.optional
			? never
			: key
		: never]-?: TreeField<TFields[key]>;
} & {
	// Filter for properties that are not assignable but are optional; mark them `readonly` and `?`.
	readonly [key in keyof TFields as TFields[key]["kind"] extends AssignableFieldKinds
		? never
		: TFields[key]["kind"] extends typeof FieldKinds.optional
		? key
		: never]?: TreeField<TFields[key]>;
} & {
	// Filter for properties that are not assignable and are not optional; mark them `readonly` and `-?`.
	readonly [key in keyof TFields as TFields[key]["kind"] extends AssignableFieldKinds
		? never
		: TFields[key]["kind"] extends typeof FieldKinds.optional
		? never
		: key]-?: TreeField<TFields[key]>;
};

/**
 * A map of string keys to tree objects.
 *
 * @privateRemarks
 * Add support for `clear` once we have established merge semantics for it.
 *
 */
export interface TreeMapNode<TSchema extends MapNodeSchema = MapNodeSchema>
	extends TreeMapNodeBase<TreeField<TSchema["info"], "notEmpty">> {}

/**
 * A map of string keys to tree objects.
 *
 * @privateRemarks
 * Add support for `clear` once we have established merge semantics for it.
 *
 * @public
 */
export interface TreeMapNodeBase<TOut, TIn = TOut> extends ReadonlyMap<string, TOut>, TreeNode {
	/**
	 * Adds or updates an entry in the map with a specified `key` and a `value`.
	 *
	 * @param key - The key of the element to add to the map.
	 * @param value - The value of the element to add to the map.
	 *
	 * @remarks
	 * Setting the value at a key to `undefined` is equivalent to calling {@link TreeMapNodeBase.delete} with that key.
	 */
	set(key: string, value: TIn | undefined): void;

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
 */
export type TreeField<
	TSchema extends TreeFieldSchema = TreeFieldSchema,
	// If "notEmpty", then optional fields will unbox to their content (not their content | undefined)
	Emptiness extends "maybeEmpty" | "notEmpty" = "maybeEmpty",
> = TreeFieldInner<TSchema["kind"], TSchema["allowedTypes"], Emptiness>;

/**
 * Helper for implementing {@link TreeField}.
 */
export type TreeFieldInner<
	Kind extends FieldKind,
	TTypes extends AllowedTypes,
	Emptiness extends "maybeEmpty" | "notEmpty",
> = Kind extends typeof FieldKinds.sequence
	? never // Sequences are only supported underneath FieldNodes. See FieldNode case in `ProxyNode`.
	: Kind extends typeof FieldKinds.required
	? TreeNodeUnion<TTypes>
	: Kind extends typeof FieldKinds.optional
	? TreeNodeUnion<TTypes> | (Emptiness extends "notEmpty" ? never : undefined)
	: unknown;

/**
 * Given multiple node schema types, return the corresponding object type union in the proxy-based API.
 */
export type TreeNodeUnion<TTypes extends AllowedTypes> = TTypes extends readonly [Any]
	? unknown
	: {
			// TODO: Is the the best way to write this type function? Can it be simplified?
			// This first maps the tuple of AllowedTypes to a tuple of node API types.
			// Then, it uses [number] to index arbitrarily into that tuple, effectively converting the type tuple into a type union.
			[Index in keyof TTypes]: TTypes[Index] extends LazyItem<infer InnerType>
				? InnerType extends TreeNodeSchema
					? TypedNode<InnerType>
					: never
				: never;
	  }[number];

/**
 * Given a node's schema, return the corresponding object in the proxy-based API.
 */
export type TypedNode<TSchema extends TreeNodeSchema> = TSchema extends LeafNodeSchema
	? TreeValue<TSchema["info"]>
	: TSchema extends MapNodeSchema
	? TreeMapNode<TSchema>
	: TSchema extends FieldNodeSchema
	? TreeListNodeOld<TSchema["info"]["allowedTypes"]>
	: TSchema extends ObjectNodeSchema
	? TreeObjectNode<TSchema>
	: TreeNode;
