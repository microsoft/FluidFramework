/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { assert } from "@fluidframework/core-utils/internal";

import type { TreeNodeSchemaIdentifier } from "../schema-stored/index.js";
import { CursorLocationType, type ITreeCursorSynchronous } from "./cursor.js";
import type { TreeValue } from "./types.js";

/**
 * An immutable sequence of primitive leaves with one type and value schema.
 * There are no child fields, defaults, or public node identities to hydrate.
 */
export interface LeafSequence {
	readonly type: TreeNodeSchemaIdentifier;
	readonly representativeValue: TreeValue;
	readonly length: number;
	at(index: number): TreeValue;
	values(start: number): IterableIterator<TreeValue>;
	slice(start: number, end: number): LeafSequence;
	/**
	 * Returns a combined sequence, or undefined if the representations cannot be combined.
	 * Slices of the same sequence must be combinable.
	 */
	tryConcat(other: LeafSequence): LeafSequence | undefined;
}

/**
 * Optional bulk leaf storage covering a cursor's chunkStart/chunkLength range in node mode.
 */
export const cursorLeafSequence: unique symbol = Symbol("cursorLeafSequence");

/**
 * Reads an optional, borrowed immutable leaf sequence without selecting a forest representation.
 */
export function tryGetLeafSequence(cursor: ITreeCursorSynchronous): LeafSequence | undefined {
	assert(
		cursor.mode === CursorLocationType.Nodes,
		"Leaf storage is only available in node mode",
	);
	return (
		cursor as ITreeCursorSynchronous & {
			readonly [cursorLeafSequence]?: LeafSequence;
		}
	)[cursorLeafSequence];
}
