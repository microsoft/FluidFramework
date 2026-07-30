/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "node:assert";

import {
	EmptyKey,
	type FieldKey,
	type ITreeCursor,
	type ITreeCursorSynchronous,
	type JsonableTree,
	type ChunkedCursor,
} from "../../../core/index.js";
import {
	BasicChunk,
	BasicChunkCursor,
	// eslint-disable-next-line import-x/no-internal-modules
} from "../../../feature-libraries/chunked-forest/basicChunk.js";
import {
	basicChunkTree,
	basicOnlyChunkPolicy,
	chunkField,
	type ChunkCompressor,
	// eslint-disable-next-line import-x/no-internal-modules
} from "../../../feature-libraries/chunked-forest/chunkTree.js";
// eslint-disable-next-line import-x/no-internal-modules
import { dummyRoot, uniformChunk } from "../../../feature-libraries/chunked-forest/index.js";
// eslint-disable-next-line import-x/no-internal-modules
import { SequenceChunk } from "../../../feature-libraries/chunked-forest/sequenceChunk.js";
import {
	TreeShape,
	UniformChunk,
	// eslint-disable-next-line import-x/no-internal-modules
} from "../../../feature-libraries/chunked-forest/uniformChunk.js";
import {
	type TreeChunk,
	chunkTree,
	cursorForJsonableTreeNode,
	jsonableTreeFromCursor,
} from "../../../feature-libraries/index.js";
import { JsonAsTree } from "../../../jsonDomainSchema.js";
import { numberSchema } from "../../../simple-tree/index.js";
import { ReferenceCountedBase, brand } from "../../../util/index.js";
import {
	type TestField,
	testGeneralPurposeTreeCursor,
	testSpecializedFieldCursor,
} from "../../cursorTestSuite.js";

import { numberSequenceField, validateChunkCursor } from "./fieldCursorTestUtilities.js";
import { emptyShape, testData } from "./uniformChunkTestData.js";

const basicOnlyChunkCompressor: ChunkCompressor = {
	policy: basicOnlyChunkPolicy,
	idCompressor: undefined,
};

describe("basic chunk", () => {
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

	it("atRoot, not nested", () => {
		const chunk: BasicChunk = new BasicChunk(
			brand("Foo"),
			new Map([[EmptyKey, [numericBasicChunk()]]]),
		);
		const cursor = chunk.cursor();
		assert(cursor.atChunkRoot());
		cursor.enterNode(0);
		assert(cursor.atChunkRoot());
		cursor.enterField(EmptyKey);
		assert(!cursor.atChunkRoot());
		cursor.enterNode(0);
		assert(!cursor.atChunkRoot());
	});

	it("atRoot, nested", () => {
		const child0 = numericBasicChunk();
		const child1 = new WrapperChunk(numericBasicChunk());
		const chunk = new SequenceChunk([child0, child1]);
		// Create a BasicChuncukCursor nested in a BasicChunkCursor.
		const cursor = chunk.cursor();
		assert(cursor.atChunkRoot());
		cursor.enterNode(1);
		assert(cursor.atChunkRoot());
		cursor.enterField(EmptyKey);
		assert(!cursor.atChunkRoot());
	});

	it("getField resolves parent via chunk array index when preceded by a multi-node chunk", () => {
		// A root field with 3 logical nodes split across 2 chunks:
		// chunks[0]: UniformChunk with 2 number nodes.
		// chunks[1]: BasicChunk holding a single subField leaf.
		const numberShape = new TreeShape(brand(numberSchema.identifier), true, []);
		const uniform = new UniformChunk(numberShape.withTopLevelLength(2), [10, 20]);

		const subField: FieldKey = brand("subField");
		const subLeaf = new BasicChunk(brand(numberSchema.identifier), new Map(), 42);
		const trailingBasic = new BasicChunk(brand("Trailing"), new Map([[subField, [subLeaf]]]));

		const cursor = new BasicChunkCursor(
			[uniform, trailingBasic],
			// siblingStack, indexStack, indexOfChunkStack, indexWithinChunkStack
			[],
			[],
			[],
			[],
			[dummyRoot],
			// index, indexOfChunk, indexWithinChunk
			0,
			0,
			0,
			undefined,
		);

		// Transitions from field to firstNode and then increments to nodeIndex 2,
		// which maps to chunk array index 1 (the trailing BasicChunk).
		cursor.enterNode(2);

		// Entering the subfield of the trailing BasicChunk calls enterField, which is followed by
		// getField, which looks up the current node (whose field we should get). This must
		// handle the case where the index of the node does not match the index of the chunk
		// containing the node in the siblings array held at the top of `siblingStack`.
		// In this test, the node index is 2 and the chunk index is 1.
		cursor.enterField(subField);
		// Validates the cursor is positioned on the subField holding the subLeaf,
		// then enters it to confirm its value (42).
		assert.equal(cursor.getFieldLength(), 1);
		cursor.firstNode();
		assert.equal(cursor.value, 42);
	});

	it("getField resolves parent via chunk array index when preceded by two multi-node chunks", () => {
		// Root field with 5 logical nodes across 3 chunks:
		// chunks[0]: UniformChunk with 2 number nodes.
		// chunks[1]: UniformChunk with 2 number nodes.
		// chunks[2]: BasicChunk with a single subField leaf.
		const numberShape = new TreeShape(brand(numberSchema.identifier), true, []);
		const uniformA = new UniformChunk(numberShape.withTopLevelLength(2), [10, 20]);
		const uniformB = new UniformChunk(numberShape.withTopLevelLength(2), [30, 40]);

		const subField: FieldKey = brand("subField");
		const subLeaf = new BasicChunk(brand(numberSchema.identifier), new Map(), 99);
		const trailingBasic = new BasicChunk(brand("Trailing"), new Map([[subField, [subLeaf]]]));

		const cursor = new BasicChunkCursor(
			[uniformA, uniformB, trailingBasic],
			[],
			[],
			[],
			[],
			[dummyRoot],
			0,
			0,
			0,
			undefined,
		);

		// Transitions from field to firstNode and then increments to nodeIndex 4,
		// which maps to chunk array index 2 (the trailing BasicChunk).
		cursor.enterNode(4);

		// Entering the subfield of the trailing BasicChunk calls enterField, which is followed by
		// getField, which looks up the current node (whose field we should get). This must
		// handle the case where the index of the node does not match the index of the chunk
		// containing the node in the siblings array held at the top of `siblingStack`.
		// In this test, the node index is 4 and the chunk index is 2.
		cursor.enterField(subField);
		// Validates the cursor is positioned on the subField holding the subLeaf,
		// then enters it to confirm its value (99).
		assert.equal(cursor.getFieldLength(), 1);
		cursor.firstNode();
		assert.equal(cursor.value, 99);
	});

	describe("SequenceChunk", () => {
		it("root", () => {
			validateChunkCursor(new SequenceChunk([numericBasicChunk(0)]), numberSequenceField(1));
			validateChunkCursor(
				new SequenceChunk([numericBasicChunk(0), numericBasicChunk(1)]),
				numberSequenceField(2),
			);
			validateChunkCursor(
				new SequenceChunk([numericBasicChunk(0), numericBasicChunk(1), numericBasicChunk(2)]),
				numberSequenceField(3),
			);
		});

		it("nested", () => {
			validateChunkCursor(
				new SequenceChunk([new SequenceChunk([numericBasicChunk(0)])]),
				numberSequenceField(1),
			);
			validateChunkCursor(
				new SequenceChunk([numericBasicChunk(0), new SequenceChunk([numericBasicChunk(1)])]),
				numberSequenceField(2),
			);
			validateChunkCursor(
				new SequenceChunk([
					new SequenceChunk([numericBasicChunk(0)]),
					new SequenceChunk([numericBasicChunk(1)]),
				]),
				numberSequenceField(2),
			);
			validateChunkCursor(
				new SequenceChunk([
					numericBasicChunk(0),
					new SequenceChunk([new SequenceChunk([numericBasicChunk(1), numericBasicChunk(2)])]),
				]),
				numberSequenceField(3),
			);
		});

		it("nested at offset", () => {
			validateChunkCursor(
				new SequenceChunk([numericBasicChunk(0), new SequenceChunk([numericBasicChunk(1)])]),
				numberSequenceField(2),
			);
		});

		it("double nested at offset", () => {
			validateChunkCursor(
				new SequenceChunk([
					numericBasicChunk(0),
					new SequenceChunk([new SequenceChunk([numericBasicChunk(1)])]),
				]),
				numberSequenceField(2),
			);
		});
	});
});

function numericBasicChunk(value: number = 0): BasicChunk {
	return new BasicChunk(brand(numberSchema.identifier), new Map(), value);
}

/**
 * Wrap chunk preventing testing its type with instanceof.
 * This allows making a TreeChunk which will not hit ant type specific special cases.
 * Wrapped chunk owns a ref to the inner one and has ref count 1.
 */
class WrapperChunk extends ReferenceCountedBase implements TreeChunk {
	public constructor(public readonly chunk: TreeChunk) {
		super();
		chunk.referenceAdded();
	}

	protected onUnreferenced(): void {
		this.chunk.referenceRemoved();
	}

	public get topLevelLength(): number {
		return this.chunk.topLevelLength;
	}

	public cursor(): ChunkedCursor {
		return this.chunk.cursor();
	}
}
