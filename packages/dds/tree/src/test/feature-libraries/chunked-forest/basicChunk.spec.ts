/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "assert";

import {
	EmptyKey,
	type ITreeCursor,
	type ITreeCursorSynchronous,
	type JsonableTree,
} from "../../../core/index.js";
import { leaf } from "../../../domains/index.js";
// eslint-disable-next-line import/no-internal-modules
import { BasicChunk } from "../../../feature-libraries/chunked-forest/basicChunk.js";
import type {
	ChunkedCursor,
	// eslint-disable-next-line import/no-internal-modules
} from "../../../feature-libraries/chunked-forest/chunk.js";
import {
	basicChunkTree,
	basicOnlyChunkPolicy,
	chunkField,
	// eslint-disable-next-line import/no-internal-modules
} from "../../../feature-libraries/chunked-forest/chunkTree.js";
// eslint-disable-next-line import/no-internal-modules
import { uniformChunk } from "../../../feature-libraries/chunked-forest/index.js";
// eslint-disable-next-line import/no-internal-modules
import { SequenceChunk } from "../../../feature-libraries/chunked-forest/sequenceChunk.js";
import {
	type TreeChunk,
	chunkTree,
	cursorForJsonableTreeNode,
	jsonableTreeFromCursor,
} from "../../../feature-libraries/index.js";
import { ReferenceCountedBase, brand } from "../../../util/index.js";
import {
	type TestField,
	testGeneralPurposeTreeCursor,
	testSpecializedFieldCursor,
} from "../../cursorTestSuite.js";

import { numberSequenceField, validateChunkCursor } from "./fieldCursorTestUtilities.js";
import { emptyShape, testData } from "./uniformChunkTestData.js";
import { JsonObject } from "../../utils.js";

describe("basic chunk", () => {
	it("calling chunkTree on existing chunk adds a reference", () => {
		const data: JsonableTree = { type: brand("Foo"), value: "test" };
		const inputCursor = cursorForJsonableTreeNode(data);
		const chunk = chunkTree(inputCursor, basicOnlyChunkPolicy);
		assert(!chunk.isShared(), "newly created chunk should not have more than one reference");

		const chunkCursor = chunk.cursor();
		chunkCursor.firstNode();
		const newChunk = chunkTree(chunkCursor, basicOnlyChunkPolicy);
		assert(
			newChunk.isShared() && chunk.isShared(),
			"chunk created off of existing chunk should be shared",
		);
	});

	it("calling chunkField on existing chunk adds a reference", () => {
		const data: JsonableTree = { type: brand("Foo"), value: "test" };
		const inputCursor = cursorForJsonableTreeNode(data);
		const chunk = chunkTree(inputCursor, basicOnlyChunkPolicy);
		assert(!chunk.isShared(), "newly created chunk should not have more than one reference");

		const chunkCursor = chunk.cursor();
		const newChunk = chunkField(chunkCursor, basicOnlyChunkPolicy);
		assert(
			newChunk[0].isShared() && chunk.isShared(),
			"chunk created off of existing chunk should be shared",
		);
	});

	testGeneralPurposeTreeCursor(
		"basic chunk",
		(data): ITreeCursor => {
			const inputCursor = cursorForJsonableTreeNode(data);
			const chunk = basicChunkTree(inputCursor, basicOnlyChunkPolicy);
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
					brand(JsonObject.identifier),
					new Map([[EmptyKey, [data.dataFactory()]]]),
				),
			reference: [
				{ type: brand(JsonObject.identifier), fields: { [EmptyKey]: data.reference } },
			],
			path: data.path,
		});
	}

	testSpecializedFieldCursor<TreeChunk, ITreeCursorSynchronous>({
		cursorName: "basic chunk + uniform chunk",
		builders: {
			withKeys: (keys) => {
				const withKeysShape = new BasicChunk(
					brand(JsonObject.identifier),
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
	return new BasicChunk(leaf.number.name, new Map(), value);
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
