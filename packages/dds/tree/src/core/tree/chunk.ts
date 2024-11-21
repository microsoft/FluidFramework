/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { assert } from "@fluidframework/core-utils/internal";

import type { ReferenceCounted } from "../../util/index.js";
import type { FieldKey } from "../schema-stored/index.js";
import { rootFieldKey } from "./types.js";
import {
	CursorLocationType,
	type ITreeCursor,
	type ITreeCursorSynchronous,
} from "./cursor.js";

/**
 * Contiguous part of the tree which get stored together in some data format.
 * Copy-on-write, but optimized to be mutated in place when a chunk only has a single user (detected using reference counting).
 * This allows for efficient cloning without major performance overheads for non-cloning scenarios.
 */
export interface TreeChunk extends ReferenceCounted {
	/**
	 * The number of nodes at the top level of this chunk.
	 *
	 * If this chunk is included in a field, this is the amount this chunk contributes to the length of the field.
	 */
	readonly topLevelLength: number;

	/**
	 * Creates a cursor for navigating the content of this chunk.
	 *
	 * Starts in "fields" mode in a `dummyRoot` field containing the top level nodes.
	 *
	 * This cursor does not own a reference to the data:
	 * it is up to the caller of this function to ensure the cursor is not used after they release their owning ref to this chunk.
	 *
	 * TODO: consider starting this in "fields" mode above the top level
	 * which would compose better with utilities for processing sequences of nodes.
	 */
	cursor(): ChunkedCursor;
}

/**
 * The key used for the field that contains the root of chunks when not parented anywhere.
 *
 * For now this is using the document root key to ease testing/compatibility, but this may change.
 */
export const dummyRoot: FieldKey = rootFieldKey;

/**
 * A symbol for extracting a TreeChunk from {@link ITreeCursor}.
 */
export const cursorChunk: unique symbol = Symbol("cursorChunk");

/**
 * Cursors can optionally implement this interface, allowing querying them for the chunk they are traversing.
 */
interface WithChunk {
	/**
	 * When in nodes mode, if a value is returned, it is a TreeChunk who's top level nodes are the
	 * chunkLength nodes starting from chunkStart.
	 *
	 *
	 * @remarks
	 * Note that there may be other tree representations with different chunk APIs and thus different ways to query them.
	 * The chunkStart and chunkLength values thus to not uniquely apply to the chunks accessed through this field.
	 *
	 * TODO:
	 * This API (including the chunk start and end on ITreeCUrsor) have some issues:
	 * 1. There are cases where multiple possible chunks could be considered.
	 * For example, when in a SequenceChunk, it could be returned, or the chunk within it could be.
	 * 2. When in a location other than the root of a chunk,
	 * it can't provide information about the containing chunk other than by allocating a new chunk that just represents that field.
	 *
	 * As more optimizations get implemented, this API may need to change to better address these issues.
	 */
	readonly [cursorChunk]?: TreeChunk | undefined;
}

/**
 * See {@link WithChunk}.
 */
export function tryGetChunk(cursor: ITreeCursor): undefined | TreeChunk {
	assert(
		cursor.mode === CursorLocationType.Nodes,
		0x57b /* cursorChunk only accessible in nodes mode */,
	);
	return (cursor as WithChunk)[cursorChunk];
}

/**
 * Cursor for a chunk which can be wrapped by another cursor.
 *
 * @remarks See `BasicChunkCursor` which uses this.
 */
export interface ChunkedCursor extends ITreeCursorSynchronous, WithChunk {
	/**
	 * Checks if the cursor is in the top level nodes of the chunk.
	 *
	 * @returns true iff cursor is within the root field, including at a node within that field.
	 */
	atChunkRoot(): boolean;

	/**
	 * Clones the cursor to produce a new independent cursor.
	 * Does not add any counted references to any chunks.
	 */
	fork(): ChunkedCursor;
}
