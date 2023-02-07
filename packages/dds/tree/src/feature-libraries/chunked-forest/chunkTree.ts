/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { ITreeCursorSynchronous, mapCursorFields, mapCursorField, SchemaData } from "../../core";
import { TreeChunk, tryGetChunk } from "./chunk";
import { BasicChunk } from "./basicChunk";

/**
 * Get a TreeChunk for the current node (and its children) of cursor.
 * This will copy if needed, but add refs to existing chunks which hold the data.
 */
export function chunkTree(cursor: ITreeCursorSynchronous, schema?: SchemaData): TreeChunk {
	// symbol based fast path to check for chunk:
	// return existing chunk with a increased ref count if possible.
	const chunk = tryGetChunk(cursor);
	if (chunk !== undefined) {
		chunk.referenceAdded();
		return chunk;
	}

	// TODO: if provided, use schema to select sections to chunk different (ex: as UniformChunks)

	// Slow path: copy tree
	return new BasicChunk(
		cursor.type,
		new Map(
			mapCursorFields(cursor, () => [
				cursor.getFieldKey(),
				mapCursorField(cursor, () => chunkTree(cursor)),
			]),
		),
		cursor.value,
	);
}
