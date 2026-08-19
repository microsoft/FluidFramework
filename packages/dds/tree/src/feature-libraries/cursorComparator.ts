/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { debugAssert } from "@fluidframework/core-utils/internal";
import {
	mapCursorField,
	mapCursorFields,
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
 * This code is on a hot path for walking formatted text, so it is optimized for performance.
 *
 * As an optimization, this makes some assumptions about the cursors,
 * which we know are true for any actual node which can exist in our public API surface,
 * but which are not guaranteed by the cursor interface itself.
 * Specifically this assumes that:
 * 1. Nodes either have fields or a value, never both.
 * 2. The type of a leaf value is possible to determine from its value.
 */
export function buildNodeComparator(cursor: ITreeCursorSynchronous): NodeComparator {
	const expectedValue: Value = cursor.value;
	const expectedType = cursor.type;

	// Fast-path for leaves:
	// This leverages the fact that nodes either have fields of values, never both, so we can skip checking fields.
	if (expectedValue !== undefined) {
		return (other: ITreeCursorSynchronous): boolean => {
			// This assumes that the type of a leaf value is possible to determine from its value,
			// so we don't need to compare the type as well.
			// This assumption is validated by the debugAssert below.
			debugAssert(
				() =>
					!Object.is(other.value, expectedValue) ||
					other.type === expectedType ||
					"Equal values must have equal types",
			);
			return Object.is(other.value, expectedValue);
		};
	}

	const fieldComparators: Map<FieldKey, (cursor: ITreeCursorSynchronous) => boolean> = new Map(
		mapCursorFields(cursor, (fieldCursor) => [
			fieldCursor.getFieldKey(),
			buildFieldComparator(mapCursorField(fieldCursor, buildNodeComparator)),
		]),
	);
	const fieldCount = fieldComparators.size;

	return (other: ITreeCursorSynchronous): boolean => {
		if (other.type !== expectedType) {
			return false;
		}
		// We assume that the type sorts nodes into leaf or not, so in this non leaf case,
		// any node with a value should have returned false above.
		// This assumption is validated by the debugAssert below.
		debugAssert(
			() => other.value === undefined || "Expected other cursor to be in Nodes mode",
		);

		let otherFieldCount = 0;
		for (let inField = other.firstField(); inField; inField = other.nextField()) {
			const fieldValidator = fieldComparators.get(other.getFieldKey());
			// eslint-disable-next-line @typescript-eslint/prefer-optional-chain -- Suggested fix fails a different lint, and needs an extra compare.
			if (fieldValidator === undefined || !fieldValidator(other)) {
				other.exitField();
				return false;
			}
			otherFieldCount++;
		}

		debugAssert(
			() => otherFieldCount <= fieldCount || "Extra fields should have been rejected above",
		);

		if (otherFieldCount !== fieldCount) {
			return false;
		}

		return true;
	};
}
