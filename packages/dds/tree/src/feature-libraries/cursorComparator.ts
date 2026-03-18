/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import {
	mapCursorField,
	inCursorField,
	type ITreeCursorSynchronous,
	type Value,
	type FieldKey,
} from "../core/index.js";
/**
 * Tests whether a cursor's current node matches a previously captured subtree.
 * Built by {@link buildNodeComparator}
 */
export type NodeComparator = (cursor: ITreeCursorSynchronous) => boolean;

type FieldComparator = (cursor: ITreeCursorSynchronous) => boolean;

/**
 * creates a FieldComparator that checks a field has the expected number of
 *
 * @remarks
 * The returned comparator checks that the field has the expected number of children
 * and that each child node matches the corresponding comparator.
 */
function buildFieldComparator(nodeComparators: NodeComparator[]): FieldComparator {
	const expectedLength = nodeComparators.length;
	return (cursor: ITreeCursorSynchronous): boolean => {
		if (cursor.getFieldLength() !== expectedLength) {
			return false;
		}
		for (let inNodes = cursor.firstNode(); inNodes; inNodes = cursor.nextNode()) {
			const comparator = nodeComparators[cursor.fieldIndex];
			if (comparator?.(cursor) !== true) {
				cursor.exitNode();
				return false;
			}
		}
		return true;
	};
}
/**
 * Walks the cursor at its current node position and builds a comparator that can test whether another
 * cursor position has the same structure and values.
 *
 * @remarks
 * Fields are compared by key (not iteration order), so this is safe regardless of cursor field ordering.
 * Missing fields in the compared node will cause a mismatch.
 *
 * The cursor must be in Nodes mode. After this call, the cursor is restored to its original position.
 *
 */
export function buildNodeComparator(cursor: ITreeCursorSynchronous): NodeComparator {
	const expectedValue: Value = cursor.value;
	if (expectedValue !== undefined) {
		return (other: ITreeCursorSynchronous): boolean => Object.is(other.value, expectedValue);
	}
	const fieldComparators: { key: FieldKey; compare: FieldComparator }[] = [];

	for (let inField = cursor.firstField(); inField; inField = cursor.nextField()) {
		const key = cursor.getFieldKey();
		const nodeComparators: NodeComparator[] = mapCursorField(cursor, buildNodeComparator);

		fieldComparators.push({
			key,
			compare: buildFieldComparator(nodeComparators),
		});
	}
	// Note: if firstField() returned false, we're already back in Nodes mode.
	// If it returned true and we iterated to exhaustion, nextField returned
	// false, which also put us back in Nodes mode.

	return (other: ITreeCursorSynchronous): boolean => {
		if (!Object.is(other.value, expectedValue)) {
			return false;
		}
		for (const { key, compare } of fieldComparators) {
			if (!inCursorField(other, key, () => compare(other))) {
				return false;
			}
		}

		return true;
	};
}
