/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "node:assert";

import {
	EmptyKey,
	type ITreeCursor,
	type ITreeCursorSynchronous,
	type JsonableTree,
} from "../../../core/index.js";
// eslint-disable-next-line import-x/no-internal-modules
import { BasicChunk } from "../../../feature-libraries/chunked-forest/basicChunk.js";
import {
	basicChunkTree,
	basicOnlyChunkPolicy,
	chunkField,
	type ChunkCompressor,
	// eslint-disable-next-line import-x/no-internal-modules
} from "../../../feature-libraries/chunked-forest/chunkTree.js";
// eslint-disable-next-line import-x/no-internal-modules
import { uniformChunk } from "../../../feature-libraries/chunked-forest/index.js";
import {
	chunkTree,
	cursorForJsonableTreeNode,
	jsonableTreeFromCursor,
	type TreeChunk,
} from "../../../feature-libraries/index.js";
import { JsonAsTree } from "../../../jsonDomainSchema.js";
import { brand } from "../../../util/index.js";
import {
	testGeneralPurposeTreeCursor,
	testSpecializedFieldCursor,
	type TestField,
} from "../../cursorTestSuite.js";

import { emptyShape, testData } from "./uniformChunkTestData.js";

const basicOnlyChunkCompressor: ChunkCompressor = {
	policy: basicOnlyChunkPolicy,
	idCompressor: undefined,
};

/**
 * BasicChunk storage and cursor conformance.
 * Shared traversal regressions live in chunkCursor.spec.ts.
 * The chunkTree/chunkField reuse tests stay here as integration coverage of BasicChunk reference ownership;
 * general chunking coverage is in chunkTree.spec.ts.
 */
describe("basicChunk", () => {
	it("calling chunkTree on existing chunk adds a reference", () => {
		const data: JsonableTree = { type: brand("Foo"), value: "test" };
		const inputCursor = cursorForJsonableTreeNode(data);
		const chunk = chunkTree(inputCursor, basicOnlyChunkCompressor);
		assert(!chunk.isShared(), "newly created chunk should not have more than one reference");

		const chunkCursor = chunk.cursor();
		chunkCursor.firstNode();
		const newChunk = chunkTree(chunkCursor, basicOnlyChunkCompressor);
		assert(
			newChunk.isShared() && chunk.isShared(),
			"chunk created off of existing chunk should be shared",
		);
	});

	it("calling chunkField on existing chunk adds a reference", () => {
		const data: JsonableTree = { type: brand("Foo"), value: "test" };
		const inputCursor = cursorForJsonableTreeNode(data);
		const chunk = chunkTree(inputCursor, basicOnlyChunkCompressor);
		assert(!chunk.isShared(), "newly created chunk should not have more than one reference");

		const chunkCursor = chunk.cursor();
		const newChunk = chunkField(chunkCursor, basicOnlyChunkCompressor);
		assert(
			newChunk[0].isShared() && chunk.isShared(),
			"chunk created off of existing chunk should be shared",
		);
	});

	testGeneralPurposeTreeCursor(
		"basic chunk",
		(data): ITreeCursor => {
			const inputCursor = cursorForJsonableTreeNode(data);
			const chunk = basicChunkTree(inputCursor, basicOnlyChunkCompressor);
			const cursor: ITreeCursor = chunk.cursor();
			cursor.enterNode(0);
			return cursor;
		},
		jsonableTreeFromCursor,
		true,
	);

	const hybridData: TestField<BasicChunk>[] = [];
	for (const data of testData) {
		hybridData.push({
			name: data.name,
			dataFactory: () =>
				new BasicChunk(
					brand(JsonAsTree.JsonObject.identifier),
					new Map([[EmptyKey, [data.dataFactory()]]]),
				),
			reference: [
				{
					type: brand(JsonAsTree.JsonObject.identifier),
					fields: { [EmptyKey]: data.reference },
				},
			],
			path: data.path,
		});
	}

	testSpecializedFieldCursor<TreeChunk, ITreeCursorSynchronous>({
		cursorName: "basic chunk + uniform chunk",
		builders: {
			withKeys: (keys) => {
				const withKeysShape = new BasicChunk(
					brand(JsonAsTree.JsonObject.identifier),
					new Map(
						keys.map((key) => [key, [uniformChunk(emptyShape.withTopLevelLength(1), [])]]),
					),
				);
				return withKeysShape;
			},
		},
		cursorFactory: (data: TreeChunk): ITreeCursorSynchronous => data.cursor(),
		testData: hybridData,
	});
});
