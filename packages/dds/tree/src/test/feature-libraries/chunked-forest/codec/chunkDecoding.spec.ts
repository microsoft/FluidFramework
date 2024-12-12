/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "node:assert";

import { compareArrays } from "@fluidframework/core-utils/internal";

// eslint-disable-next-line import/no-internal-modules
import { BasicChunk } from "../../../../feature-libraries/chunked-forest/basicChunk.js";
import {
	type ChunkDecoder,
	type StreamCursor,
	readStream,
	// eslint-disable-next-line import/no-internal-modules
} from "../../../../feature-libraries/chunked-forest/codec/chunkCodecUtilities.js";
import {
	InlineArrayDecoder,
	NestedArrayDecoder,
	TreeDecoder,
	aggregateChunks,
	anyDecoder,
	deaggregateChunks,
	decode,
	readValue,
	// eslint-disable-next-line import/no-internal-modules
} from "../../../../feature-libraries/chunked-forest/codec/chunkDecoding.js";
// eslint-disable-next-line import/no-internal-modules
import { DecoderContext } from "../../../../feature-libraries/chunked-forest/codec/chunkDecodingGeneric.js";
import {
	type EncodedChunkShape,
	SpecialField,
	version,
	// eslint-disable-next-line import/no-internal-modules
} from "../../../../feature-libraries/chunked-forest/codec/format.js";
import {
	emptyChunk,
	// eslint-disable-next-line import/no-internal-modules
} from "../../../../feature-libraries/chunked-forest/emptyChunk.js";
// eslint-disable-next-line import/no-internal-modules
import { SequenceChunk } from "../../../../feature-libraries/chunked-forest/sequenceChunk.js";
import type { TreeChunk } from "../../../../feature-libraries/index.js";
import { type ReferenceCountedBase, brand } from "../../../../util/index.js";
import { assertChunkCursorEquals } from "../fieldCursorTestUtilities.js";
import { testIdCompressor } from "../../../utils.js";

function assertRefCount(item: ReferenceCountedBase, count: 0 | 1 | "shared"): void {
	switch (count) {
		case 0:
			assert(item.isUnreferenced());
			break;
		case 1:
			assert(!item.isUnreferenced());
			assert(!item.isShared());
			break;
		case "shared":
			assert(item.isShared());
			break;
		default:
			break;
	}
}

/**
 * Appends a message to the log read from the stream when decoding (if not provided as `message`), and returns a ref to the provided chunk.
 */
function makeLoggingDecoder(log: string[], chunk: TreeChunk, message?: string): ChunkDecoder {
	return {
		decode(decoders: readonly ChunkDecoder[], stream: StreamCursor): TreeChunk {
			log.push(message ?? (readStream(stream) as string));
			chunk.referenceAdded();
			return chunk;
		},
	};
}
const idDecodingContext = {
	idCompressor: testIdCompressor,
	originatorId: testIdCompressor.localSessionId,
};
describe("chunkDecoding", () => {
	describe("decode", () => {
		// Smoke test for top level decode function.
		// All real functionality should be tested in more specific tests.
		it("minimal", () => {
			const result = decode(
				{
					version,
					identifiers: [],
					shapes: [{ a: 0 }],
					data: [[0, []]],
				},
				idDecodingContext,
			);
			assert.deepEqual(result, [emptyChunk]);
		});
	});

	describe("readValue", () => {
		it("unknown shape", () => {
			const stream: StreamCursor = { data: [false, true, "x", true, 1], offset: 0 };
			assert.equal(readValue(stream, undefined, idDecodingContext), undefined);
			assert.equal(readValue(stream, undefined, idDecodingContext), "x");
			assert.equal(readValue(stream, undefined, idDecodingContext), 1);
			assert.equal(stream.offset, 5);
		});

		it("boolean shape", () => {
			const stream: StreamCursor = { data: [1, 2, 3], offset: 0 };
			assert.equal(readValue(stream, true, idDecodingContext), 1);
			assert.equal(stream.offset, 1);
			assert.equal(readValue(stream, false, idDecodingContext), undefined);
			assert.equal(stream.offset, 1);
			assert.equal(readValue(stream, true, idDecodingContext), 2);
			assert.equal(stream.offset, 2);
		});

		it("constant shape", () => {
			const stream: StreamCursor = { data: [1, 2, 3], offset: 0 };
			assert.equal(readValue(stream, ["x"], idDecodingContext), "x");
			assert.equal(stream.offset, 0);
		});

		describe("SpecialField shape", () => {
			it("identifier field", () => {
				const compressedId = testIdCompressor.generateCompressedId();
				const stableId = testIdCompressor.decompress(compressedId);
				const stream: StreamCursor = { data: [compressedId], offset: 0 };
				assert.equal(readValue(stream, SpecialField.Identifier, idDecodingContext), stableId);
				assert.equal(stream.offset, 1);
			});
		});
	});

	it("deaggregateChunks", () => {
		assert.deepEqual(deaggregateChunks(emptyChunk), []);
		const basic = new BasicChunk(brand("foo"), new Map());
		assertRefCount(basic, 1);
		assert.deepEqual(deaggregateChunks(basic), [basic]);
		assertRefCount(basic, 1);
		const basic2 = new BasicChunk(brand("boo"), new Map());
		const sequence = new SequenceChunk([basic, basic2]);
		assert.deepEqual(deaggregateChunks(sequence), [basic, basic2]);
		assertRefCount(sequence, 0);
		assertRefCount(basic, 1);
	});

	it("aggregateChunks", () => {
		assert.equal(aggregateChunks([]), emptyChunk);
		assert.equal(aggregateChunks([emptyChunk, emptyChunk]), emptyChunk);
		const basic = new BasicChunk(brand("foo"), new Map());
		assert.equal(aggregateChunks([emptyChunk, basic, emptyChunk]), basic);
		assertRefCount(basic, 1);
		const basic2 = new BasicChunk(brand("boo"), new Map());
		const sequence = new SequenceChunk([basic, basic2]);
		{
			sequence.referenceAdded();
			assertRefCount(basic, 1);
			const aggregated = aggregateChunks([emptyChunk, sequence]);
			assertRefCount(basic, "shared"); // aggregated and sequence both own a ref.
			assert(aggregated instanceof SequenceChunk);
			assert(compareArrays(aggregated.subChunks, [basic, basic2]));
			basic.referenceRemoved();
			basic2.referenceRemoved();
		}

		assertRefCount(sequence, 1);
		assertRefCount(basic, 1);
		assertRefCount(basic2, 1);

		{
			basic.referenceAdded();
			assertRefCount(basic, "shared");
			const aggregated = aggregateChunks([basic, sequence]);
			assert(aggregated instanceof SequenceChunk);
			assert.deepEqual(aggregated.subChunks, [basic, basic, basic2]);

			assertRefCount(sequence, 0);
			assertRefCount(aggregated, 1);
			// Release sequence containing everything
			aggregated.referenceRemoved();
			// No refs should be left.
			assertRefCount(aggregated, 0);
			assertRefCount(basic, 0);
			assertRefCount(basic2, 0);
		}
	});

	describe("EncodedNestedArray", () => {
		it("empty", () => {
			const decoder = new NestedArrayDecoder(0);
			const log: string[] = [];
			const basic = new BasicChunk(brand("foo"), new Map());
			const decoders = [makeLoggingDecoder(log, basic)];
			const stream: StreamCursor = { data: [[]], offset: 0 };
			const result = decoder.decode(decoders, stream);
			assert.deepEqual(log, []);
			assert.equal(result, emptyChunk);
			assertRefCount(basic, 1);
		});

		it("empty-zero sized", () => {
			const decoder = new NestedArrayDecoder(0);
			const log: string[] = [];
			const basic = new BasicChunk(brand("foo"), new Map());
			const decoders = [makeLoggingDecoder(log, basic)];
			const stream = { data: [0], offset: 0 };
			const result = decoder.decode(decoders, stream);
			assert.deepEqual(log, []);
			assert.equal(result, emptyChunk);
			assertRefCount(basic, 1);
		});

		it("non-empty", () => {
			const decoder = new NestedArrayDecoder(0);
			const log: string[] = [];
			const basic = new BasicChunk(brand("foo"), new Map());
			const decoders = [makeLoggingDecoder(log, basic)];
			const stream = { data: [["a", "b"]], offset: 0 };
			const result = decoder.decode(decoders, stream);
			assert.deepEqual(log, ["a", "b"]);
			assert(result instanceof SequenceChunk);
			assert(compareArrays(result.subChunks, [basic, basic]));
			assertRefCount(basic, "shared");
		});

		it("non-empty zero sized", () => {
			const decoder = new NestedArrayDecoder(0);
			const log: string[] = [];
			const basic = new BasicChunk(brand("foo"), new Map());
			const decoders = [makeLoggingDecoder(log, basic, "X")];
			const stream = { data: [2], offset: 0 };
			const result = decoder.decode(decoders, stream);
			assert.deepEqual(log, ["X", "X"]);
			assert(result instanceof SequenceChunk);
			assert(compareArrays(result.subChunks, [basic, basic]));
			assertRefCount(basic, "shared");
		});
	});

	describe("EncodedInlineArray", () => {
		it("empty", () => {
			const decoder = new InlineArrayDecoder({ length: 0, shape: 0 });
			const log: string[] = [];
			const basic = new BasicChunk(brand("foo"), new Map());
			const decoders = [makeLoggingDecoder(log, basic)];
			const stream = { data: ["unused data"], offset: 0 };
			const result = decoder.decode(decoders, stream);
			assert.equal(stream.offset, 0);
			assert.deepEqual(log, []);
			assert.equal(result, emptyChunk);
			assertRefCount(basic, 1);
		});

		it("non-empty", () => {
			const decoder = new InlineArrayDecoder({ length: 2, shape: 0 });
			const log: string[] = [];
			const basic = new BasicChunk(brand("foo"), new Map());
			const decoders = [makeLoggingDecoder(log, basic)];
			const stream = { data: ["a", "b"], offset: 0 };
			const result = decoder.decode(decoders, stream);
			assert.deepEqual(log, ["a", "b"]);
			assert(result instanceof SequenceChunk);
			assert(compareArrays(result.subChunks, [basic, basic]));
			assertRefCount(basic, "shared");
		});
	});

	it("anyDecoder", () => {
		const log: string[] = [];
		const basic0 = new BasicChunk(brand("0"), new Map());
		const basic1 = new BasicChunk(brand("1"), new Map());
		const decoders = [makeLoggingDecoder(log, basic0), makeLoggingDecoder(log, basic1)];
		const stream = { data: [0, "a", 0, "b", 1, "c"], offset: 0 };
		assert.equal(anyDecoder.decode(decoders, stream), basic0);
		assert.equal(anyDecoder.decode(decoders, stream), basic0);
		assert.equal(anyDecoder.decode(decoders, stream), basic1);
		assert.deepEqual(log, ["a", "b", "c"]);
	});

	describe("TreeDecoder", () => {
		it("empty node", () => {
			const cache = new DecoderContext([], [], idDecodingContext);
			const decoder = new TreeDecoder(
				{
					value: false,
					fields: [],
				},
				cache,
			);
			const stream = { data: ["foo"], offset: 0 };
			const result = decoder.decode([], stream);
			assertChunkCursorEquals(result, [{ type: brand("foo") }]);
		});

		it("typed node", () => {
			const cache = new DecoderContext([], [], idDecodingContext);
			const decoder = new TreeDecoder(
				{
					type: "baz",
					value: false,
					fields: [],
				},
				cache,
			);
			const stream = { data: [], offset: 0 };
			const result = decoder.decode([], stream);
			assertChunkCursorEquals(result, [{ type: brand("baz") }]);
		});

		it("identifier node", () => {
			const compressedId = testIdCompressor.generateCompressedId();
			const stableId = testIdCompressor.decompress(compressedId);
			const cache = new DecoderContext([], [], idDecodingContext);

			const decoder = new TreeDecoder(
				{
					type: "identifier",
					value: SpecialField.Identifier,
					fields: [],
				},
				cache,
			);
			const stream = { data: [compressedId], offset: 0 };
			const result = decoder.decode([], stream);
			assertChunkCursorEquals(result, [{ type: brand("identifier"), value: stableId }]);
		});

		it("dynamic", () => {
			const cache = new DecoderContext(["b", "d"], [], idDecodingContext);
			const log: string[] = [];
			const localChunk = new BasicChunk(brand("local"), new Map());
			const decoders = [makeLoggingDecoder(log, localChunk)];
			const decoder = new TreeDecoder(
				{
					fields: [],
					extraFields: 0,
				},
				cache,
			);
			const stream = {
				data: ["type", true, "value", ["a", "l1", 0, "l2"], ["c", "g1", 1, "g2", "e", "g3"]],
				offset: 0,
			};
			const result = decoder.decode(decoders, stream);
			assertChunkCursorEquals(result, [
				{
					type: brand("type"),
					value: "value",
					fields: {
						a: [{ type: brand("local") }],
						b: [{ type: brand("local") }],
					},
				},
			]);
			assert.deepEqual(log, ["l1", "l2"]);
		});

		it("fixed fields", () => {
			const cache = new DecoderContext(
				["key"],
				// This is unused, but used to bounds check the index into decoders, so it needs 2 items.
				[null as unknown as EncodedChunkShape, null as unknown as EncodedChunkShape],
				idDecodingContext,
			);
			const log: string[] = [];
			const localChunk = new BasicChunk(brand("local"), new Map());
			const decoders = [makeLoggingDecoder(log, localChunk)];
			const decoder = new TreeDecoder(
				{
					fields: [[0, 0]],
					value: false,
				},
				cache,
			);
			const stream = {
				data: ["type", "l1", "g1"],
				offset: 0,
			};
			const result = decoder.decode(decoders, stream);
			assertChunkCursorEquals(result, [
				{
					type: brand("type"),
					fields: {
						key: [{ type: brand("local") }],
					},
				},
			]);
			assert.deepEqual(log, ["l1"]);
		});
	});
});
