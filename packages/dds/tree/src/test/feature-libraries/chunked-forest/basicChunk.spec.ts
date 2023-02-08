/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "assert";
import {
	TestField,
	testGeneralPurposeTreeCursor,
	testSpecializedFieldCursor,
} from "../../cursorTestSuite";
import {
	EmptyKey,
	ITreeCursor,
	ITreeCursorSynchronous,
	JsonableTree,
	TreeSchemaIdentifier,
} from "../../../core";
import {
	jsonableTreeFromCursor,
	singleTextCursor,
	chunkTree,
	TreeChunk,
} from "../../../feature-libraries";
import { brand } from "../../../util";
// eslint-disable-next-line import/no-internal-modules
import { uniformChunk } from "../../../feature-libraries/chunked-forest";
// eslint-disable-next-line import/no-internal-modules
import { BasicChunk } from "../../../feature-libraries/chunked-forest/basicChunk";

import {
	basicChunkTree,
	basicOnlyChunkPolicy,
	chunkField,
	// eslint-disable-next-line import/no-internal-modules
} from "../../../feature-libraries/chunked-forest/chunkTree";
// eslint-disable-next-line import/no-internal-modules
import { SequenceChunk } from "../../../feature-libraries/chunked-forest/sequenceChunk";
import { jsonNumber } from "../../../domains";
import {
	ChunkedCursor,
	ReferenceCountedBase,
	// eslint-disable-next-line import/no-internal-modules
} from "../../../feature-libraries/chunked-forest/chunk";
import { emptyShape, testData } from "./uniformChunkTestData";
import { numberSequenceField, validateChunkCursor } from "./fieldCursorTestUtilities";

describe("basic chunk", () => {
	it("calling chunkTree on existing chunk adds a reference", () => {
		const data: JsonableTree = { type: brand("Foo"), value: "test" };
		const inputCursor = singleTextCursor(data);
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
		const inputCursor = singleTextCursor(data);
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
			const inputCursor = singleTextCursor(data);
			const chunk = basicChunkTree(inputCursor, basicOnlyChunkPolicy);
			const cursor: ITreeCursor = chunk.cursor();
			cursor.enterNode(0);
			return cursor;
		},
		jsonableTreeFromCursor,
		true,
	);

	const schema: TreeSchemaIdentifier = brand("fakeSchema");

	const hybridData: TestField<BasicChunk>[] = [];
	for (const data of testData) {
		hybridData.push({
			name: data.name,
			dataFactory: () => new BasicChunk(schema, new Map([[EmptyKey, [data.dataFactory()]]])),
			reference: [{ type: schema, fields: { [EmptyKey]: data.reference } }],
			path: data.path,
		});
	}

	testSpecializedFieldCursor<TreeChunk, ITreeCursorSynchronous>({
		cursorName: "basic chunk + uniform chunk",
		builders: {
			withKeys: (keys) => {
				const withKeysShape = new BasicChunk(
					schema,
					new Map(
						keys.map((key) => [
							key,
							[uniformChunk(emptyShape.withTopLevelLength(1), [])],
						]),
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
				new SequenceChunk([
					numericBasicChunk(0),
					numericBasicChunk(1),
					numericBasicChunk(2),
				]),
				numberSequenceField(3),
			);
		});

		it("nested", () => {
			validateChunkCursor(
				new SequenceChunk([new SequenceChunk([numericBasicChunk(0)])]),
				numberSequenceField(1),
			);
			validateChunkCursor(
				new SequenceChunk([
					numericBasicChunk(0),
					new SequenceChunk([numericBasicChunk(1)]),
				]),
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
					new SequenceChunk([
						new SequenceChunk([numericBasicChunk(1), numericBasicChunk(2)]),
					]),
				]),
				numberSequenceField(3),
			);
		});

		it("nested at offset", () => {
			validateChunkCursor(
				new SequenceChunk([
					numericBasicChunk(0),
					new SequenceChunk([numericBasicChunk(1)]),
				]),
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
	return new BasicChunk(jsonNumber.name, new Map(), value);
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

	protected dispose(): void {
		this.chunk.referenceRemoved();
	}

	get topLevelLength(): number {
		return this.chunk.topLevelLength;
	}

	cursor(): ChunkedCursor {
		return this.chunk.cursor();
	}
}
