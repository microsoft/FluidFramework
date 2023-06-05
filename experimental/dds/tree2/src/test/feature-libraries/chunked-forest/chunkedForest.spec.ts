/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "assert";

// Allow importing from this specific file which is being tested:
/* eslint-disable-next-line import/no-internal-modules */
import { buildChunkedForest } from "../../../feature-libraries/chunked-forest/chunkedForest";
// eslint-disable-next-line import/no-internal-modules
import { tryGetChunk } from "../../../feature-libraries/chunked-forest/chunk";
import {
	basicChunkTree,
	basicOnlyChunkPolicy,
	// eslint-disable-next-line import/no-internal-modules
} from "../../../feature-libraries/chunked-forest/chunkTree";

import {
	mintRevisionTag,
	initializeForest,
	InMemoryStoredSchemaRepository,
	JsonableTree,
	mapCursorField,
	moveToDetachedField,
	rootFieldKeySymbol,
	Delta,
	IForestSubscription,
} from "../../../core";
import { jsonSchema } from "../../../domains";
import {
	ForestRepairDataStore,
	defaultSchemaPolicy,
	jsonableTreeFromCursor,
	singleTextCursor,
} from "../../../feature-libraries";
import { testForest } from "../../forestTestSuite";
import { brand } from "../../../util";
import { mockIntoDelta } from "../../utils";

describe("ChunkedForest", () => {
	testForest({
		suiteName: "ChunkedForest forest suite",
		factory: () =>
			buildChunkedForest(new InMemoryStoredSchemaRepository(defaultSchemaPolicy, jsonSchema)),
		skipCursorErrorCheck: true,
	});

	it("doesn't copy data when capturing and restoring repair data", () => {
		const initialState: JsonableTree = { type: brand("Node") };
		const forest = buildChunkedForest(
			new InMemoryStoredSchemaRepository(defaultSchemaPolicy, jsonSchema),
		);
		const chunk = basicChunkTree(singleTextCursor(initialState), basicOnlyChunkPolicy);

		// Insert chunk into forest
		{
			const chunkCursor = chunk.cursor();
			chunkCursor.firstNode();
			initializeForest(forest, [chunkCursor]);
			assert(chunk.isShared());
			chunk.referenceRemoved(); // chunkCursor
		}
		// forest should hold the only ref to chunk.
		assert(!chunk.isShared());
		compareForest(forest, [initialState]);

		const repairStore = new ForestRepairDataStore(forest, mockIntoDelta);
		const delta: Delta.Root = new Map([
			[rootFieldKeySymbol, [{ type: Delta.MarkType.Delete, count: 1 }]],
		]);

		const revision = mintRevisionTag();
		// Capture reference to content before delete.
		repairStore.capture(delta, revision);
		// Captured reference owns a ref count making it shared.
		assert(chunk.isShared());
		// Delete from forest, removing the forest's ref, making chunk not shared again.
		forest.applyDelta(delta);
		assert(!chunk.isShared());
		compareForest(forest, []);

		// Confirm the data from the repair store is chunk
		const data = repairStore.getNodes(revision, undefined, rootFieldKeySymbol, 0, 1);
		const chunk2 = tryGetChunk(data[0]);
		assert(chunk === chunk2);

		// Put it back in the forest, which adds a ref again
		initializeForest(forest, data);
		assert(
			chunk.isShared(),
			"chunk should be shared after storing as repair data and reinserting",
		);
		compareForest(forest, [initialState]);
	});
});

function compareForest(forest: IForestSubscription, expected: JsonableTree[]): void {
	const readCursor = forest.allocateCursor();
	moveToDetachedField(forest, readCursor);
	const actual = mapCursorField(readCursor, jsonableTreeFromCursor);
	readCursor.free();
	assert.deepEqual(actual, expected);
}
