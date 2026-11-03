/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { assert } from "@fluidframework/core-utils/internal";

import type { StringSequence } from "../../util/index.js";
import { CursorLocationType, type ITreeCursorSynchronous } from "./cursor.js";

/**
 * Optional string storage covering a cursor's chunkStart/chunkLength range in node mode.
 * Every atom is a leaf of the cursor's current type.
 */
export const cursorStringSequence: unique symbol = Symbol("cursorStringSequence");

/**
 * Reads optional, borrowed immutable string storage without selecting a forest representation.
 */
export function tryGetStringSequence(
	cursor: ITreeCursorSynchronous,
): StringSequence | undefined {
	assert(
		cursor.mode === CursorLocationType.Nodes,
		"String storage is only available in node mode",
	);
	return (
		cursor as ITreeCursorSynchronous & {
			readonly [cursorStringSequence]?: StringSequence;
		}
	)[cursorStringSequence];
}
