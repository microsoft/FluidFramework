/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "node:assert";

import {
	dummyRoot,
	type TreeChunk,
	type TreeNodeSchemaIdentifier,
} from "../../../core/index.js";
import {
	combineChunks,
	cursorForMapTreeField,
	jsonableTreeFromFieldCursor,
} from "../../../feature-libraries/index.js";
// eslint-disable-next-line import-x/no-internal-modules
import { TreeShape } from "../../../feature-libraries/chunked-forest/uniformChunk.js";
// eslint-disable-next-line import-x/no-internal-modules
import {
	StringChunk,
	stringBufferSize,
	// eslint-disable-next-line import-x/no-internal-modules
} from "../../../feature-libraries/chunked-forest/stringChunk.js";
// eslint-disable-next-line import-x/no-internal-modules
import {
	chunkRange,
	chunkField,
	makePolicy,
	splitFieldAtIndex,
	coalesceUniformChunks,
	// eslint-disable-next-line import-x/no-internal-modules
} from "../../../feature-libraries/chunked-forest/chunkTree.js";
import { stringSchema } from "../../../simple-tree/index.js";
import { brand } from "../../../util/index.js";
import { testSpecializedFieldCursor } from "../../cursorTestSuite.js";

const type: TreeNodeSchemaIdentifier = brand(stringSchema.identifier);
const policy = makePolicy({ stringChunks: true });
const compressor = { policy, idCompressor: undefined };

describe("StringChunk", () => {
	it("preserves empty and multi-character leaves on the generic path", () => {
		const values = ["a", "", "bc", "\u{1F600}", "\uD800", "\uDC00"];
		const cursor = cursorForMapTreeField(
			values.map((value) => ({
				type,
				value,
				fields: new Map(),
			})),
		);
		const chunks = chunkField(cursor, {
			policy: makePolicy({
				stringChunks: true,
				shapeFromSchema: () => new TreeShape(type, true, []),
			}),
			idCompressor: undefined,
		});
		assert.deepEqual(
			jsonableTreeFromFieldCursor(combineChunks(chunks).cursor()),
			values.map((value) => ({ type, value })),
		);
	});

	testSpecializedFieldCursor<TreeChunk, ReturnType<TreeChunk["cursor"]>>({
		cursorName: "string pieces",
		builders: {},
		cursorFactory: (chunk) => chunk.cursor(),
		testData: ["", "hello", "a\u{1F600}b", "\uD800x\uDC00", "ab\u{1F600}".repeat(40)].map(
			(text) => ({
				name: JSON.stringify(text),
				dataFactory: () => combineChunks(StringChunk.fromString(type, text)),
				reference: [...text].map((value) => ({ type, value })),
				path: { parent: undefined, field: dummyRoot },
			}),
		),
	});

	it("splits pieces and restores contiguous ranges without changing the source", () => {
		const original = StringChunk.fromString(type, "abc\u{1F600}def")[0];
		assert(original !== undefined);
		original.referenceAdded();
		const chunks: TreeChunk[] = [original];
		assert.equal(splitFieldAtIndex(chunks, 4, compressor), 1);
		assert.equal(chunks.length, 2);
		assert(chunks.every((chunk) => chunk instanceof StringChunk));
		assert.equal(chunks[0].text, "abc\u{1F600}");
		assert.equal(chunks[1].text, "def");
		coalesceUniformChunks(chunks, policy);
		assert.equal(chunks.length, 1);
		assert.equal(chunks[0].text, original.text);
		assert.equal(original.text, "abc\u{1F600}def");
		chunks[0]?.referenceRemoved();
		original.referenceRemoved();
	});

	it("preserves surrogate boundaries when coalescing", () => {
		const chunks = [
			...StringChunk.fromString(type, "\uD800"),
			...StringChunk.fromString(type, "\uDC00"),
		];
		coalesceUniformChunks(chunks, policy);
		assert.equal(chunks.length, 2);
		assert.deepEqual(
			jsonableTreeFromFieldCursor(combineChunks(chunks).cursor()),
			["\uD800", "\uDC00"].map((value) => ({ type, value })),
		);
	});

	it("bounds backing buffers without splitting surrogate pairs", () => {
		const text = `${"x".repeat(stringBufferSize - 1)}\u{1F600}${"y".repeat(stringBufferSize)}`;
		const chunks = StringChunk.fromString(type, text);
		assert.equal(chunks.map((chunk) => chunk.text).join(""), text);
		assert.equal(
			chunks.reduce((count, chunk) => count + chunk.topLevelLength, 0),
			[...text].length,
		);
		assert(chunks.every((chunk) => chunk.text.length <= stringBufferSize));
	});

	it("takes partial chunks from cursors without expanding leaves", () => {
		const original = StringChunk.fromString(type, "a\u{1F600}bc")[0];
		assert(original !== undefined);
		const cursor = original.cursor();
		cursor.enterNode(1);
		const chunks = chunkRange(cursor, compressor, 2, true);
		assert.equal(chunks.length, 1);
		assert(chunks[0] instanceof StringChunk);
		assert.equal(chunks[0].text, "\u{1F600}b");
		assert.equal(cursor.value, "b");
	});
});
