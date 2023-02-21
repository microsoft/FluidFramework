/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "assert";
import { v4 as uuid } from "uuid";

// Allow importing from this specific file which is being tested:
/* eslint-disable-next-line import/no-internal-modules */
import { buildChunkedForest } from "../../../feature-libraries/chunked-forest/chunkedForest";
/* eslint-disable-next-line import/no-internal-modules */
import { BasicChunk } from "../../../feature-libraries/chunked-forest/basicChunk";

import {
	AnchorSet,
	Checkout,
	EditManager,
	FieldKey,
	mintRevisionTag,
	initializeForest,
	InMemoryStoredSchemaRepository,
	JsonableTree,
	mapCursorField,
	mapCursorFields,
	moveToDetachedField,
	rootFieldKeySymbol,
	TransactionResult,
} from "../../../core";
import { jsonSchemaData } from "../../../domains";
import {
	chunkTree,
	DefaultChangeFamily,
	defaultChangeFamily,
	DefaultChangeset,
	DefaultEditBuilder,
	defaultSchemaPolicy,
	jsonableTreeFromCursor,
	runSynchronousTransaction,
	singleTextCursor,
	defaultChunkPolicy,
} from "../../../feature-libraries";
import { testForest } from "../../forestTestSuite";
import { brand } from "../../../util";

const fooKey: FieldKey = brand("foo");

describe("ChunkedForest", () => {
	testForest({
		suiteName: "ChunkedForest forest suite",
		factory: () =>
			buildChunkedForest(
				new InMemoryStoredSchemaRepository(defaultSchemaPolicy, jsonSchemaData),
			),
		skipCursorErrorCheck: true,
	});

	it("doesn't copy data when capturing and restoring repair data", () => {
		const initialState: JsonableTree = {
			type: brand("Node"),
			fields: {
				foo: [
					{ type: brand("Number"), value: 0 },
					{ type: brand("Number"), value: 1 },
					{ type: brand("Number"), value: 2 },
				],
			},
		};
		const anchors = new AnchorSet();
		const forest = buildChunkedForest(
			new InMemoryStoredSchemaRepository(defaultSchemaPolicy, jsonSchemaData),
			anchors,
		);
		const editManager: EditManager<DefaultChangeset, DefaultChangeFamily> = new EditManager(
			defaultChangeFamily,
			anchors,
		);
		editManager.initSessionId(uuid());
		const cursor = singleTextCursor(initialState);
		const chunk = new TestChunk(
			cursor.type,
			new Map(
				mapCursorFields(cursor, () => [
					cursor.getFieldKey(),
					mapCursorField(cursor, () => chunkTree(cursor, defaultChunkPolicy)),
				]),
			),
			cursor.value,
		);
		const chunkCursor = chunk.cursor();
		chunkCursor.firstNode();
		initializeForest(forest, [chunkCursor]);

		const checkout: Checkout<DefaultEditBuilder, DefaultChangeset> = {
			forest,
			changeFamily: defaultChangeFamily,
			submitEdit: (edit) => {
				const delta = editManager.addLocalChange(mintRevisionTag(), edit);
				forest.applyDelta(delta);
			},
		};

		assert(chunk.isShared(), "chunk should be shared after forest initialization");
		assert.equal(chunk.referenceCount, 2);

		runSynchronousTransaction(checkout, (_, editor) => {
			const rootField = editor.sequenceField(undefined, rootFieldKeySymbol);
			rootField.delete(0, 1);
			// Aborting the transaction should restore the forest
			return TransactionResult.Abort;
		});

		assert(
			chunk.isShared(),
			"chunk should be shared after storing as repair data and reinserting",
		);
		assert.equal(chunk.referenceCount, 4);

		const readCursor = forest.allocateCursor();
		moveToDetachedField(forest, readCursor);
		const actual = mapCursorField(readCursor, jsonableTreeFromCursor);
		readCursor.free();
		assert.deepEqual(actual, [initialState]);
	});
});

class TestChunk extends BasicChunk {
	public referenceCount: number = 1;

	public referenceAdded(): void {
		super.referenceAdded();
		this.referenceCount++;
	}
}
