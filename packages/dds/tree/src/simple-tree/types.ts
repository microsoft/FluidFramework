/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import {
	FlexFieldNodeSchema,
	FlexMapNodeSchema,
	FlexObjectNodeSchema,
} from "../feature-libraries/index.js";
import { WithType, type } from "./schemaTypes.js";
import { IterableTreeArrayContent } from "./treeArrayNode.js";

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
 * A non-leaf SharedTree node. Includes objects, arrays, and maps.
 *
 * @remarks
 * Base type which all nodes implement.
 *
 * This can be used as a type to indicate/document values which should be tree nodes.
 * Runtime use of this class object (for example when used with `instanceof` or subclassed), is not supported:
 * it may be replaced with an interface or union in the future.
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
}

/**
 * A generic array type, used to defined types like {@link (TreeArrayNode:interface)}.
 *
 * @privateRemarks
 * Inlining this into TreeArrayNode causes recursive array use to stop compiling.
 *
 * @public
 */
export interface TreeArrayNodeBase<out T, in TNew, in TMoveFrom>
	extends ReadonlyArray<T>,
		TreeNode {
	/**
	 * Inserts new item(s) at a specified location.
	 * @param index - The index at which to insert `value`.
	 * @param value - The content to insert.
	 * @throws Throws if `index` is not in the range [0, `array.length`).
	 */
	insertAt(index: number, ...value: (TNew | IterableTreeArrayContent<TNew>)[]): void;

	/**
	 * Inserts new item(s) at the start of the array.
	 * @param value - The content to insert.
	 */
	insertAtStart(...value: (TNew | IterableTreeArrayContent<TNew>)[]): void;

	/**
	 * Inserts new item(s) at the end of the array.
	 * @param value - The content to insert.
	 */
	insertAtEnd(...value: (TNew | IterableTreeArrayContent<TNew>)[]): void;

	/**
	 * Removes the item at the specified location.
	 * @param index - The index at which to remove the item.
	 * @throws Throws if `index` is not in the range [0, `array.length`).
	 */
	removeAt(index: number): void;

	/**
	 * Removes all items between the specified indices.
	 * @param start - The starting index of the range to remove (inclusive). Defaults to the start of the array.
	 * @param end - The ending index of the range to remove (exclusive).
	 * @throws Throws if `start` is not in the range [0, `array.length`).
	 * @throws Throws if `end` is less than `start`.
	 * If `end` is not supplied or is greater than the length of the array, all items after `start` are removed.
	 */
	removeRange(start?: number, end?: number): void;

	/**
	 * Moves the specified item to the start of the array.
	 * @param sourceIndex - The index of the item to move.
	 * @throws Throws if `sourceIndex` is not in the range [0, `array.length`).
	 */
	moveToStart(sourceIndex: number): void;

	/**
	 * Moves the specified item to the start of the array.
	 * @param sourceIndex - The index of the item to move.
	 * @param source - The source array to move the item out of.
	 * @throws Throws if `sourceIndex` is not in the range [0, `array.length`).
	 */
	moveToStart(sourceIndex: number, source: TMoveFrom): void;

	/**
	 * Moves the specified item to the end of the array.
	 * @param sourceIndex - The index of the item to move.
	 * @throws Throws if `sourceIndex` is not in the range [0, `array.length`).
	 */
	moveToEnd(sourceIndex: number): void;

	/**
	 * Moves the specified item to the end of the array.
	 * @param sourceIndex - The index of the item to move.
	 * @param source - The source array to move the item out of.
	 * @throws Throws if `sourceIndex` is not in the range [0, `array.length`).
	 */
	moveToEnd(sourceIndex: number, source: TMoveFrom): void;

	/**
	 * Moves the specified item to the desired location in the array.
	 * @param index - The index to move the item to.
	 * This is based on the state of the array before moving the source item.
	 * @param sourceIndex - The index of the item to move.
	 * @throws Throws if any of the input indices are not in the range [0, `array.length`).
	 */
	moveToIndex(index: number, sourceIndex: number): void;

	/**
	 * Moves the specified item to the desired location in the array.
	 * @param index - The index to move the item to.
	 * @param sourceIndex - The index of the item to move.
	 * @param source - The source array to move the item out of.
	 * @throws Throws if any of the input indices are not in the range [0, `array.length`).
	 */
	moveToIndex(index: number, sourceIndex: number, source: TMoveFrom): void;

	/**
	 * Moves the specified items to the start of the array.
	 * @param sourceStart - The starting index of the range to move (inclusive).
	 * @param sourceEnd - The ending index of the range to move (exclusive)
	 * @throws Throws if either of the input indices are not in the range [0, `array.length`) or if `sourceStart` is greater than `sourceEnd`.
	 */
	moveRangeToStart(sourceStart: number, sourceEnd: number): void;

	/**
	 * Moves the specified items to the start of the array.
	 * @param sourceStart - The starting index of the range to move (inclusive).
	 * @param sourceEnd - The ending index of the range to move (exclusive)
	 * @param source - The source array to move items out of.
	 * @throws Throws if the types of any of the items being moved are not allowed in the destination array,
	 * if either of the input indices are not in the range [0, `array.length`) or if `sourceStart` is greater than `sourceEnd`.
	 */
	moveRangeToStart(sourceStart: number, sourceEnd: number, source: TMoveFrom): void;

	/**
	 * Moves the specified items to the end of the array.
	 * @param sourceStart - The starting index of the range to move (inclusive).
	 * @param sourceEnd - The ending index of the range to move (exclusive)
	 * @throws Throws if either of the input indices are not in the range [0, `array.length`) or if `sourceStart` is greater than `sourceEnd`.
	 */
	moveRangeToEnd(sourceStart: number, sourceEnd: number): void;

	/**
	 * Moves the specified items to the end of the array.
	 * @param sourceStart - The starting index of the range to move (inclusive).
	 * @param sourceEnd - The ending index of the range to move (exclusive)
	 * @param source - The source array to move items out of.
	 * @throws Throws if the types of any of the items being moved are not allowed in the destination array,
	 * if either of the input indices are not in the range [0, `array.length`) or if `sourceStart` is greater than `sourceEnd`.
	 */
	moveRangeToEnd(sourceStart: number, sourceEnd: number, source: TMoveFrom): void;

	/**
	 * Moves the specified items to the desired location within the array.
	 * @param index - The index to move the items to.
	 * This is based on the state of the array before moving the source items.
	 * @param sourceStart - The starting index of the range to move (inclusive).
	 * @param sourceEnd - The ending index of the range to move (exclusive)
	 * @throws Throws if any of the input indices are not in the range [0, `array.length`) or if `sourceStart` is greater than `sourceEnd`.
	 */
	moveRangeToIndex(index: number, sourceStart: number, sourceEnd: number): void;

	/**
	 * Moves the specified items to the desired location within the array.
	 * @param index - The index to move the items to.
	 * @param sourceStart - The starting index of the range to move (inclusive).
	 * @param sourceEnd - The ending index of the range to move (exclusive)
	 * @param source - The source array to move items out of.
	 * @throws Throws if the types of any of the items being moved are not allowed in the destination array,
	 * if any of the input indices are not in the range [0, `array.length`) or if `sourceStart` is greater than `sourceEnd`.
	 */
	moveRangeToIndex(
		index: number,
		sourceStart: number,
		sourceEnd: number,
		source: TMoveFrom,
	): void;
}

/**
 * Given a node's schema, return the corresponding object in the proxy-based API.
 */
export type TypedNode<
	TSchema extends FlexObjectNodeSchema | FlexFieldNodeSchema | FlexMapNodeSchema,
> = TreeNode & WithType<TSchema["name"]>;
