/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { assert } from "@fluidframework/core-utils/internal";

import type { StringSequence } from "../../util/index.js";
import { CursorLocationType, type ITreeCursorSynchronous } from "./cursor.js";

/**
 * A symbol for extracting a {@link StringSequence} from an {@link ITreeCursorSynchronous}.
 * @see {@link WithStringSequence | WithStringSequence's [cursorStringSequence] property}.
 */
export const cursorStringSequence: unique symbol = Symbol("cursorStringSequence");

/**
 * Cursors can optionally implement this interface, allowing querying them for the immutable string storage they are traversing.
 */
interface WithStringSequence {
	/**
	 * The {@link StringSequence} containing the current node, when available.
	 *
	 * @remarks
	 * Only valid in {@link CursorLocationType.Nodes} mode.
	 * The sequence's atoms are the {@link ITreeCursorSynchronous.chunkLength} leaf nodes starting at {@link ITreeCursorSynchronous.chunkStart}.
	 * This range may cover only part of the current field.
	 * Every atom has the cursor's current type.
	 * The current node's index in the sequence is {@link ITreeCursorSynchronous.fieldIndex} minus {@link ITreeCursorSynchronous.chunkStart}.
	 * The returned sequence is immutable and can be retained independently of the cursor or any containing chunk.
	 * Keeping a JavaScript reference to the sequence keeps its backing storage alive.
	 * Accessing this property does not transfer ownership of or add counted references to any containing chunks.
	 *
	 * Callers may use this to efficiently access the string content for fast-path optimizations.
	 * This serves a similar role to `cursorChunk`, but for string content.
	 * This capability may be unavailable even when the current node's value is a string.
	 */
	readonly [cursorStringSequence]?: StringSequence | undefined;
}

/**
 * See {@link WithStringSequence}.
 */
export function tryGetStringSequence(
	cursor: ITreeCursorSynchronous,
): StringSequence | undefined {
	assert(
		cursor.mode === CursorLocationType.Nodes,
		"String storage is only available in node mode",
	);
	return (cursor as WithStringSequence)[cursorStringSequence];
}
