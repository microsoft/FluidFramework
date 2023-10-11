/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { AllowedTypes } from "../../typed-schema";
import {
	UnboxNodeUnion,
	CheckTypesOverlap,
	FlexibleNodeContent,
	Sequence,
} from "../editableTreeTypes";

/** Implements 'readonly T[]' and the list mutation APIs. */
export interface List<TTypes extends AllowedTypes> extends ReadonlyArray<UnboxNodeUnion<TTypes>> {
	/**
	 * Inserts new item(s) at a specified location.
	 * @param index - The index at which to insert `value`.
	 * @param value - The content to insert.
	 * @throws Throws if any of the input indices are invalid.
	 */
	insertAt(index: number, value: Iterable<FlexibleNodeContent<TTypes>>): void;

	/**
	 * Inserts new item(s) at the start of the sequence.
	 * @param value - The content to insert.
	 * @throws Throws if any of the input indices are invalid.
	 */
	insertAtStart(value: Iterable<FlexibleNodeContent<TTypes>>): void;

	/**
	 * Inserts new item(s) at the end of the sequence.
	 * @param value - The content to insert.
	 * @throws Throws if any of the input indices are invalid.
	 */
	insertAtEnd(value: Iterable<FlexibleNodeContent<TTypes>>): void;

	/**
	 * Removes the item at the specified location.
	 * @param index - The index at which to remove the item.
	 * @throws Throws if any of the input indices are invalid.
	 */
	removeAt(index: number): void;

	/**
	 * Removes all items between the specified indices.
	 * @param start - The starting index of the range to remove (inclusive). Defaults to the start of the sequence.
	 * @param end - The ending index of the range to remove (exclusive).
	 * @throws Throws if any of the input indices are invalid.
	 * If `end` is not supplied or is greater than the length of the sequence, all items after `start` are deleted.
	 */
	removeRange(start?: number, end?: number): void;

	/**
	 * Moves the specified items to the start of the sequence.
	 * @param sourceStart - The starting index of the range to move (inclusive).
	 * @param sourceEnd - The ending index of the range to move (exclusive)
	 * @throws Throws if any of the input indices are invalid.
	 * @remarks
	 * All indices are relative to the sequence excluding the nodes being moved.
	 */
	moveToStart(sourceStart: number, sourceEnd: number): void;

	/**
	 * Moves the specified items to the start of the sequence.
	 * @param sourceStart - The starting index of the range to move (inclusive).
	 * @param sourceEnd - The ending index of the range to move (exclusive)
	 * @param source - The source sequence to move items out of.
	 * @throws Throws if the types of any of the items being moved are not allowed in the destination sequence or if the input indices are invalid.
	 * @remarks
	 * All indices are relative to the sequence excluding the nodes being moved.
	 */
	moveToStart<TTypesSource extends AllowedTypes>(
		sourceStart: number,
		sourceEnd: number,
		source: Sequence<CheckTypesOverlap<TTypesSource, TTypes>>,
	): void;

	/**
	 * Moves the specified items to the end of the sequence.
	 * @param sourceStart - The starting index of the range to move (inclusive).
	 * @param sourceEnd - The ending index of the range to move (exclusive)
	 * @throws Throws if any of the input indices are invalid.
	 * @remarks
	 * All indices are relative to the sequence excluding the nodes being moved.
	 */
	moveToEnd(sourceStart: number, sourceEnd: number): void;

	/**
	 * Moves the specified items to the end of the sequence.
	 * @param sourceStart - The starting index of the range to move (inclusive).
	 * @param sourceEnd - The ending index of the range to move (exclusive)
	 * @param source - The source sequence to move items out of.
	 * @throws Throws if the types of any of the items being moved are not allowed in the destination sequence or if the input indices are invalid.
	 * @remarks
	 * All indices are relative to the sequence excluding the nodes being moved.
	 */
	moveToEnd<TTypesSource extends AllowedTypes>(
		sourceStart: number,
		sourceEnd: number,
		source: Sequence<CheckTypesOverlap<TTypesSource, TTypes>>,
	): void;

	/**
	 * Moves the specified items to the desired location within the sequence.
	 * @param index - The index to move the items to.
	 * @param sourceStart - The starting index of the range to move (inclusive).
	 * @param sourceEnd - The ending index of the range to move (exclusive)
	 * @throws Throws if any of the input indices are invalid.
	 * @remarks
	 * All indices are relative to the sequence excluding the nodes being moved.
	 */
	moveToIndex(index: number, sourceStart: number, sourceEnd: number): void;

	// TODO: Should accept a proxy rather than sequence field as source.

	// /**
	//  * Moves the specified items to the desired location within the sequence.
	//  * @param index - The index to move the items to.
	//  * @param sourceStart - The starting index of the range to move (inclusive).
	//  * @param sourceEnd - The ending index of the range to move (exclusive)
	//  * @param source - The source sequence to move items out of.
	//  * @throws Throws if the types of any of the items being moved are not allowed in the destination sequence or if the input indices are invalid.
	//  * @remarks
	//  * All indices are relative to the sequence excluding the nodes being moved.
	//  */
	// moveToIndex<TTypesSource extends AllowedTypes>(
	// 	index: number,
	// 	sourceStart: number,
	// 	sourceEnd: number,
	// 	source: Sequence<CheckTypesOverlap<TTypesSource, TTypes>>,
	// ): void;
}
