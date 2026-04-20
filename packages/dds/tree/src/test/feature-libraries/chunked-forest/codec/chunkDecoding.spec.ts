/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "node:assert";

import { compareArrays } from "@fluidframework/core-utils/internal";
import type { SessionId } from "@fluidframework/id-compressor";
import { createIdCompressor, createSessionId } from "@fluidframework/id-compressor/internal";
import { validateAssertionError } from "@fluidframework/test-runtime-utils/internal";

import type { TreeNodeSchemaIdentifier, TreeValue } from "../../../../core/index.js";
// eslint-disable-next-line import-x/no-internal-modules
import { BasicChunk } from "../../../../feature-libraries/chunked-forest/basicChunk.js";
import {
	type ChunkDecoder,
	type StreamCursor,
	readStream,
	// eslint-disable-next-line import-x/no-internal-modules
} from "../../../../feature-libraries/chunked-forest/codec/chunkCodecUtilities.js";
import {
	type IdDecodingContext,
	InlineArrayDecoder,
	IncrementalChunkDecoder,
	NestedArrayDecoder,
	NodeDecoder,
	SpecializedNodeDecoder,
	aggregateChunks,
	anyDecoder,
	deaggregateChunks,
	decode,
	readValue,
	// eslint-disable-next-line import-x/no-internal-modules
} from "../../../../feature-libraries/chunked-forest/codec/chunkDecoding.js";
// eslint-disable-next-line import-x/no-internal-modules
import { DecoderContext } from "../../../../feature-libraries/chunked-forest/codec/chunkDecodingGeneric.js";
import {
	fieldBatchCodecBuilder,
	type ChunkReferenceId,
	type IncrementalDecoder,
	// eslint-disable-next-line import-x/no-internal-modules
} from "../../../../feature-libraries/chunked-forest/codec/codecs.js";
import {
	type EncodedChunkShapeV1,
	type EncodedChunkShape,
	type EncodedChunkShapeVTextExperimental,
	type EncodedFieldBatchV1OrV2,
	type EncodedNodeShape,
	FieldBatchFormatVersion,
	SpecialField,
	// eslint-disable-next-line import-x/no-internal-modules
} from "../../../../feature-libraries/chunked-forest/codec/format/index.js";
import {
	emptyChunk,
	// eslint-disable-next-line import-x/no-internal-modules
} from "../../../../feature-libraries/chunked-forest/emptyChunk.js";
// eslint-disable-next-line import-x/no-internal-modules
import { SequenceChunk } from "../../../../feature-libraries/chunked-forest/sequenceChunk.js";
import type { TreeChunk } from "../../../../feature-libraries/index.js";
import { type ReferenceCountedBase, brand } from "../../../../util/index.js";
import { testIdCompressor } from "../../../utils.js";
import { assertChunkCursorEquals } from "../fieldCursorTestUtilities.js";

function assertRefCount(item: ReferenceCountedBase, count: 0 | 1 | "shared"): void {
	switch (count) {
		case 0: {
			assert(item.isUnreferenced());
			break;
		}
		case 1: {
			assert(!item.isUnreferenced());
			assert(!item.isShared());
			break;
		}
		case "shared": {
			assert(item.isShared());
			break;
		}
		default: {
			break;
		}
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
	isSummary: false,
};

describe("chunkDecoding", () => {
	describe("decode", () => {
		// Smoke test for top level decode function.
		// All real functionality should be tested in more specific tests.
		for (const version of fieldBatchCodecBuilder.registry.map(
			(entry) => entry.formatVersion,
		)) {
			describe(`FieldBatchFormatVersion ${version}`, () => {
				it("minimal", () => {
					const result = decode(
						{
							version: brand(version),
							identifiers: [],
							shapes: [{ a: 0 }],
							data: [[0, []]],
						},
						idDecodingContext,
					);
					assert.deepEqual(result, [emptyChunk]);
				});
			});
		}
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

			describe("healUnresolvableIdentifiersOnDecode", () => {
				/**
				 * Mints an op-space ID that is unresolvable by `testIdCompressor`:
				 * generated in a fresh foreign compressor whose session is unknown
				 * to `testIdCompressor`, so `normalizeToSessionSpace` will throw.
				 */
				function makeUnresolvableOpSpaceId(): {
					opSpaceId: number;
					originatorId: SessionId;
				} {
					const foreignSession = createSessionId();
					const foreignCompressor = createIdCompressor(foreignSession);
					const sessionSpaceId = foreignCompressor.generateCompressedId();
					const opSpaceId = foreignCompressor.normalizeToOpSpace(sessionSpaceId);
					return { opSpaceId, originatorId: foreignSession };
				}

				function makeStream(opSpaceId: number): StreamCursor {
					return { data: [opSpaceId], offset: 0 };
				}

				// Error message thrown by chunkDecoding.readValue when it detects a
				// non-finalized op-space id during a summary load and healing is not
				// available. See `chunkDecoding.ts`.
				const nonFinalizedDuringSummaryError =
					/Summary could not be loaded due incorrectly encoded identifier\./;

				it("throws when the heal flag is not enabled", () => {
					const { opSpaceId, originatorId } = makeUnresolvableOpSpaceId();
					const ctx: IdDecodingContext = {
						idCompressor: testIdCompressor,
						originatorId,
						isSummary: true,
						sharedObjectId: "doc-a",
					};
					assert.throws(
						() => readValue(makeStream(opSpaceId), SpecialField.Identifier, ctx),
						nonFinalizedDuringSummaryError,
					);
				});

				it("heals to a stable UUID when enabled during a summary load", () => {
					const { opSpaceId, originatorId } = makeUnresolvableOpSpaceId();
					const ctx: IdDecodingContext = {
						idCompressor: testIdCompressor,
						originatorId,
						isSummary: true,
						healUnresolvableIdentifiersOnDecode: true,
						sharedObjectId: "doc-a",
					};
					const result = readValue(makeStream(opSpaceId), SpecialField.Identifier, ctx);
					assert.equal(typeof result, "string");
					assert.equal(result, "d5d534e7-5e2c-53c3-b26c-9fd81e6fbc37");
				});

				it("produces the same UUID for the same (sharedObjectId, opSpaceId) inputs", () => {
					const { opSpaceId } = makeUnresolvableOpSpaceId();
					const originator1 = "originator-1" as SessionId;
					const originator2 = "originator-2" as SessionId;
					const heal = (originatorId: SessionId): unknown =>
						readValue(makeStream(opSpaceId), SpecialField.Identifier, {
							idCompressor: testIdCompressor,
							originatorId,
							isSummary: true,
							healUnresolvableIdentifiersOnDecode: true,
							sharedObjectId: "doc-a",
						});
					assert.equal(heal(originator1), heal(originator2));
				});

				it("produces different UUIDs for different sharedObjectIds", () => {
					const { opSpaceId, originatorId } = makeUnresolvableOpSpaceId();
					const heal = (sharedObjectId: string): unknown =>
						readValue(makeStream(opSpaceId), SpecialField.Identifier, {
							idCompressor: testIdCompressor,
							originatorId,
							isSummary: true,
							healUnresolvableIdentifiersOnDecode: true,
							sharedObjectId,
						});
					assert.notEqual(heal("doc-a"), heal("doc-b"));
				});

				it("produces different UUIDs for different op-space ids", () => {
					const foreignSession = createSessionId();
					const foreignCompressor = createIdCompressor(foreignSession);
					const opSpaceA = foreignCompressor.normalizeToOpSpace(
						foreignCompressor.generateCompressedId(),
					);
					const opSpaceB = foreignCompressor.normalizeToOpSpace(
						foreignCompressor.generateCompressedId(),
					);
					assert.notEqual(opSpaceA, opSpaceB);
					const heal = (opSpaceId: number): unknown =>
						readValue(makeStream(opSpaceId), SpecialField.Identifier, {
							idCompressor: testIdCompressor,
							originatorId: foreignSession,
							isSummary: true,
							healUnresolvableIdentifiersOnDecode: true,
							sharedObjectId: "doc-a",
						});
					assert.notEqual(heal(opSpaceA), heal(opSpaceB));
				});

				it("does not heal during op decode (isSummary === false)", () => {
					const { opSpaceId, originatorId } = makeUnresolvableOpSpaceId();
					const ctx: IdDecodingContext = {
						idCompressor: testIdCompressor,
						originatorId,
						isSummary: false,
						healUnresolvableIdentifiersOnDecode: true,
						sharedObjectId: "doc-a",
					};
					// Not a summary, so chunkDecoding's non-finalized-id branch does not
					// fire; the id-compressor's own resolution failure is the symptom.
					// Match the *type* of failure rather than its specific message, since
					// the id-compressor's wording varies across the scenarios that hit it.
					assert.throws(
						() => readValue(makeStream(opSpaceId), SpecialField.Identifier, ctx),
						(err: unknown) => err instanceof Error,
					);
				});

				it("returns the normally-resolved value when the id is resolvable, even with heal enabled", () => {
					// `testIdCompressor` knows about its own session, so this id is
					// resolvable and should never take the heal path.
					const compressedId = testIdCompressor.generateCompressedId();
					const opSpaceId = testIdCompressor.normalizeToOpSpace(compressedId);
					const expected = testIdCompressor.decompress(compressedId);
					const result = readValue(makeStream(opSpaceId), SpecialField.Identifier, {
						idCompressor: testIdCompressor,
						originatorId: testIdCompressor.localSessionId,
						isSummary: true,
						healUnresolvableIdentifiersOnDecode: true,
						sharedObjectId: "doc-a",
					});
					assert.equal(result, expected);
				});
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

	describe("EncodedNestedArrayShape", () => {
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

	describe("EncodedInlineArrayShape", () => {
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

	describe("NodeDecoder", () => {
		it("empty node", () => {
			const cache = new DecoderContext(
				[],
				[],
				idDecodingContext,
				undefined /* incrementalDecoder */,
			);
			const decoder = new NodeDecoder(
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
			const cache = new DecoderContext(
				[],
				[],
				idDecodingContext,
				undefined /* incrementalDecoder */,
			);
			const decoder = new NodeDecoder(
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
			const cache = new DecoderContext(
				[],
				[],
				idDecodingContext,
				undefined /* incrementalDecoder */,
			);

			const decoder = new NodeDecoder(
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
			const cache = new DecoderContext(
				["b", "d"],
				[],
				idDecodingContext,
				undefined /* incrementalDecoder */,
			);
			const log: string[] = [];
			const localChunk = new BasicChunk(brand("local"), new Map());
			const decoders = [makeLoggingDecoder(log, localChunk)];
			const decoder = new NodeDecoder(
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
				[null as unknown as EncodedChunkShapeV1, null as unknown as EncodedChunkShapeV1],
				idDecodingContext,
				undefined /* incrementalDecoder */,
			);
			const log: string[] = [];
			const localChunk = new BasicChunk(brand("local"), new Map());
			const decoders = [makeLoggingDecoder(log, localChunk)];
			const decoder = new NodeDecoder(
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

	describe("SpecializedNodeDecoder", () => {
		function makeContext(
			identifiers: string[],
			shapes: EncodedChunkShapeVTextExperimental[],
		): DecoderContext<EncodedChunkShape> {
			return new DecoderContext(
				identifiers,
				shapes as unknown as EncodedChunkShape[],
				idDecodingContext,
				undefined,
			);
		}

		it("delegates to base when f is empty", () => {
			const shapes: EncodedChunkShapeVTextExperimental[] = [
				{ c: { type: "MyNode", value: false, fields: [] } },
			];
			const context = makeContext([], shapes);
			const decoder = new SpecializedNodeDecoder({ base: 0, fields: [] }, context);
			const stream = { data: [], offset: 0 };
			const result = decoder.decode([], stream);
			assertChunkCursorEquals(result, [{ type: brand("MyNode") }]);
			assert.equal(stream.offset, 0);
		});

		it("overrides a field with a constant-value shape", () => {
			// shapes[0]: base FormatNode with two variable-value fields
			// shapes[1]: variable boolean (bold base shape — not used after override)
			// shapes[2]: variable number (size)
			// shapes[3]: constant false boolean (bold override — contributes 0 stream tokens)
			const shapes: EncodedChunkShapeVTextExperimental[] = [
				{
					c: {
						type: "FormatNode",
						value: false,
						fields: [
							["bold", 1],
							["size", 2],
						],
					},
				},
				{ c: { type: "boolean", value: true } },
				{ c: { type: "number", value: true } },
				{ c: { type: "boolean", value: [false] } },
			];
			const context = makeContext([], shapes);
			const decoders = shapes.map((s) => new NodeDecoder(s.c as EncodedNodeShape, context));
			const decoder = new SpecializedNodeDecoder({ base: 0, fields: [["bold", 3]] }, context);

			// Only size=12 is in the stream; bold contributes no tokens (constant).
			const stream = { data: [12], offset: 0 };
			const result = decoder.decode(decoders, stream);

			assertChunkCursorEquals(result, [
				{
					type: brand("FormatNode"),
					fields: {
						bold: [{ type: brand("boolean"), value: false }],
						size: [{ type: brand("number"), value: 12 }],
					},
				},
			]);
			assert.equal(stream.offset, 1);
		});

		it("appends a field not present in the base", () => {
			// shapes[0]: base with only "a"
			// shapes[1]: leaf shape for "a"
			// shapes[2]: constant leaf shape for new field "b"
			const shapes: EncodedChunkShapeVTextExperimental[] = [
				{ c: { type: "MyNode", value: false, fields: [["a", 1]] } },
				{ c: { type: "leaf", value: true } },
				{ c: { type: "leaf", value: ["extra"] } },
			];
			const context = makeContext([], shapes);
			const decoders = shapes.map((s) => new NodeDecoder(s.c as EncodedNodeShape, context));
			const decoder = new SpecializedNodeDecoder({ base: 0, fields: [["b", 2]] }, context);

			const stream = { data: [99], offset: 0 };
			const result = decoder.decode(decoders, stream);

			assertChunkCursorEquals(result, [
				{
					type: brand("MyNode"),
					fields: {
						a: [{ type: brand("leaf"), value: 99 }],
						b: [{ type: brand("leaf"), value: "extra" }],
					},
				},
			]);
			assert.equal(stream.offset, 1);
		});

		it("chains through an intermediate f shape", () => {
			// shapes[0]: base c-shape with two variable fields
			// shapes[1]: variable leaf
			// shapes[2]: constant leaf
			// shapes[3]: intermediate f — overrides "a" with constant
			// spec: {base:3, fields:[["b", 2]]} — further overrides "b" with constant
			const shapes: EncodedChunkShapeVTextExperimental[] = [
				{
					c: {
						type: "MyNode",
						value: false,
						fields: [
							["a", 1],
							["b", 1],
						],
					},
				},
				{ c: { type: "leaf", value: true } },
				{ c: { type: "leaf", value: ["const"] } },
				{ f: { base: 0, fields: [["a", 2]] } },
			];
			const context = makeContext([], shapes);
			const decoders = [
				new NodeDecoder(shapes[0].c as EncodedNodeShape, context),
				new NodeDecoder(shapes[1].c as EncodedNodeShape, context),
				new NodeDecoder(shapes[2].c as EncodedNodeShape, context),
				// decoders[3] is never called since SpecializedNodeDecoder resolves f chains at construction
				new NodeDecoder(shapes[1].c as EncodedNodeShape, context),
			];
			const decoder = new SpecializedNodeDecoder({ base: 3, fields: [["b", 2]] }, context);

			// Both fields are now constant — stream is empty.
			const stream = { data: [], offset: 0 };
			const result = decoder.decode(decoders, stream);

			assertChunkCursorEquals(result, [
				{
					type: brand("MyNode"),
					fields: {
						a: [{ type: brand("leaf"), value: "const" }],
						b: [{ type: brand("leaf"), value: "const" }],
					},
				},
			]);
			assert.equal(stream.offset, 0);
		});

		it("preserves base order when spec lists overrides in different order", () => {
			// base lists fields [a, b]; spec overrides both but lists them as [b, a].
			// Stream consumption follows merged-fields order, which the implementation
			// derives from base order — so a is read first, then b. Both end up using
			// shape 2 (the override target), producing type "after".
			const shapes: EncodedChunkShapeVTextExperimental[] = [
				{
					c: {
						type: "MyNode",
						value: false,
						fields: [
							["a", 1],
							["b", 1],
						],
					},
				},
				{ c: { type: "before", value: true } },
				{ c: { type: "after", value: true } },
			];
			const context = makeContext([], shapes);
			const decoders = shapes.map((s) => new NodeDecoder(s.c as EncodedNodeShape, context));
			const decoder = new SpecializedNodeDecoder(
				{
					base: 0,
					fields: [
						["b", 2],
						["a", 2],
					],
				},
				context,
			);

			const stream = { data: [10, 20], offset: 0 };
			const result = decoder.decode(decoders, stream);

			assertChunkCursorEquals(result, [
				{
					type: brand("MyNode"),
					fields: {
						a: [{ type: brand("after"), value: 10 }],
						b: [{ type: brand("after"), value: 20 }],
					},
				},
			]);
			assert.equal(stream.offset, 2);
		});

		it("appends new keys in spec order, after base fields", () => {
			// base: [[a, 1]]. spec: [[x, 1], [y, 1]] — two new keys.
			// Merged order is base-then-spec: [a, x, y]. The stream is consumed
			// in that order, so a=10, x=20, y=30.
			const shapes: EncodedChunkShapeVTextExperimental[] = [
				{ c: { type: "MyNode", value: false, fields: [["a", 1]] } },
				{ c: { type: "leaf", value: true } },
			];
			const context = makeContext([], shapes);
			const decoders = shapes.map((s) => new NodeDecoder(s.c as EncodedNodeShape, context));
			const decoder = new SpecializedNodeDecoder(
				{
					base: 0,
					fields: [
						["x", 1],
						["y", 1],
					],
				},
				context,
			);

			const stream = { data: [10, 20, 30], offset: 0 };
			const result = decoder.decode(decoders, stream);

			assertChunkCursorEquals(result, [
				{
					type: brand("MyNode"),
					fields: {
						a: [{ type: brand("leaf"), value: 10 }],
						x: [{ type: brand("leaf"), value: 20 }],
						y: [{ type: brand("leaf"), value: 30 }],
					},
				},
			]);
			assert.equal(stream.offset, 3);
		});

		it("interleaved spec entries: overrides land at base positions, new keys append in spec order", () => {
			// base.fields = [[a, 1], [b, 1]]
			// spec.fields = [[x, 1], [b, 2], [y, 1], [a, 2]] — interleaves new x, override
			//   b, new y, override a. Merged order should be base-overrides-in-place then
			//   new-keys-in-spec-order: [[a, 2], [b, 2], [x, 1], [y, 1]].
			//
			// Stream layout follows the merged order: a, b, x, y. If the implementation
			// followed spec order instead, x would land where a should be, etc.
			const shapes: EncodedChunkShapeVTextExperimental[] = [
				{
					c: {
						type: "MyNode",
						value: false,
						fields: [
							["a", 1],
							["b", 1],
						],
					},
				},
				{ c: { type: "before", value: true } },
				{ c: { type: "after", value: true } },
			];
			const context = makeContext([], shapes);
			const decoders = shapes.map((s) => new NodeDecoder(s.c as EncodedNodeShape, context));
			const decoder = new SpecializedNodeDecoder(
				{
					base: 0,
					fields: [
						["x", 1],
						["b", 2],
						["y", 1],
						["a", 2],
					],
				},
				context,
			);

			const stream = { data: [10, 20, 30, 40], offset: 0 };
			const result = decoder.decode(decoders, stream);

			// a (override → shape 2 "after") reads 10
			// b (override → shape 2 "after") reads 20
			// x (new, shape 1 "before") reads 30
			// y (new, shape 1 "before") reads 40
			assertChunkCursorEquals(result, [
				{
					type: brand("MyNode"),
					fields: {
						a: [{ type: brand("after"), value: 10 }],
						b: [{ type: brand("after"), value: 20 }],
						x: [{ type: brand("before"), value: 30 }],
						y: [{ type: brand("before"), value: 40 }],
					},
				},
			]);
			assert.equal(stream.offset, 4);
		});

		it("chain: outer f extends and overrides keys added by inner f", () => {
			// shapes[0]: base with [a].
			// shapes[1]: variable leaf "before".
			// shapes[2]: variable leaf "after" (the override target).
			// shapes[3]: inner f — adds x with shape 1.
			// outer spec: { base: 3, fields: [[x, 2], [y, 1]] }
			//   - overrides x (added by inner) to shape 2
			//   - adds y as a brand new key
			// Merged order: [a (base), x (inner-added), y (outer-added)]. The outer's
			// override of x is applied at x's existing position, not at the end.
			const shapes: EncodedChunkShapeVTextExperimental[] = [
				{ c: { type: "MyNode", value: false, fields: [["a", 1]] } },
				{ c: { type: "before", value: true } },
				{ c: { type: "after", value: true } },
				{ f: { base: 0, fields: [["x", 1]] } },
			];
			const context = makeContext([], shapes);
			const decoders = [
				new NodeDecoder(shapes[0].c as EncodedNodeShape, context),
				new NodeDecoder(shapes[1].c as EncodedNodeShape, context),
				new NodeDecoder(shapes[2].c as EncodedNodeShape, context),
				// decoders[3] is never invoked — f-chains are resolved at construction.
				new NodeDecoder(shapes[1].c as EncodedNodeShape, context),
			];
			const decoder = new SpecializedNodeDecoder(
				{
					base: 3,
					fields: [
						["x", 2],
						["y", 1],
					],
				},
				context,
			);

			const stream = { data: [10, 20, 30], offset: 0 };
			const result = decoder.decode(decoders, stream);

			// a (base, shape 1) reads 10 → "before".
			// x (inner-added, outer overrode to shape 2) reads 20 → "after".
			// y (outer-added, shape 1) reads 30 → "before".
			assertChunkCursorEquals(result, [
				{
					type: brand("MyNode"),
					fields: {
						a: [{ type: brand("before"), value: 10 }],
						x: [{ type: brand("after"), value: 20 }],
						y: [{ type: brand("before"), value: 30 }],
					},
				},
			]);
			assert.equal(stream.offset, 3);
		});

		it("overrides value to a constant", () => {
			// Base declares value as variable (`true`). Spec pins it to a constant
			// ["bold"], so per-occurrence the value contributes 0 stream tokens.
			const shapes: EncodedChunkShapeVTextExperimental[] = [
				{ c: { type: "FormatNode", value: true, fields: [] } },
			];
			const context = makeContext([], shapes);
			const decoder = new SpecializedNodeDecoder({ base: 0, value: ["bold"] }, context);

			const stream = { data: [], offset: 0 };
			const result = decoder.decode([], stream);

			assertChunkCursorEquals(result, [{ type: brand("FormatNode"), value: "bold" }]);
			assert.equal(stream.offset, 0);
		});

		it("overrides value to false to narrow from variable to no-value", () => {
			// Base declares value as variable (`true`). Spec pins it to `false` (no value).
			// Discriminates "value" in spec semantics from a `??` fallback — `false ?? base`
			// would incorrectly inherit from the base.
			const shapes: EncodedChunkShapeVTextExperimental[] = [
				{ c: { type: "FormatNode", value: true, fields: [] } },
			];
			const context = makeContext([], shapes);
			const decoder = new SpecializedNodeDecoder({ base: 0, value: false }, context);

			const stream = { data: [], offset: 0 };
			const result = decoder.decode([], stream);

			assertChunkCursorEquals(result, [{ type: brand("FormatNode") }]);
			assert.equal(stream.offset, 0);
		});

		it("overrides extraFields to enable extra-field decoding", () => {
			// Base has no extraFields. Spec adds extraFields pointing at a leaf shape.
			// Stream carries one nested array — the extra-fields tape — containing one
			// [key, ...data] pair: ["x", 99]. The leaf decoder reads 99.
			const shapes: EncodedChunkShapeVTextExperimental[] = [
				{ c: { type: "MyNode", value: false, fields: [] } },
				{ c: { type: "leaf", value: true } },
			];
			const context = makeContext([], shapes);
			const decoders = shapes.map((s) => new NodeDecoder(s.c as EncodedNodeShape, context));
			const decoder = new SpecializedNodeDecoder({ base: 0, extraFields: 1 }, context);

			const stream = { data: [["x", 99]], offset: 0 };
			const result = decoder.decode(decoders, stream);

			assertChunkCursorEquals(result, [
				{
					type: brand("MyNode"),
					fields: { x: [{ type: brand("leaf"), value: 99 }] },
				},
			]);
			assert.equal(stream.offset, 1);
		});

		it("inherits value, extraFields, and fields from base when spec omits them", () => {
			// Base declares value as a constant ["base-val"], extraFields pointing at shape 1,
			// and a single fixed field "a". Spec is `{ base: 0 }` — no overrides.
			// All three should pass through unchanged.
			const shapes: EncodedChunkShapeVTextExperimental[] = [
				{
					c: {
						type: "MyNode",
						value: ["base-val"],
						fields: [["a", 1]],
						extraFields: 1,
					},
				},
				{ c: { type: "leaf", value: true } },
			];
			const context = makeContext([], shapes);
			const decoders = shapes.map((s) => new NodeDecoder(s.c as EncodedNodeShape, context));
			const decoder = new SpecializedNodeDecoder({ base: 0 }, context);

			// Stream layout: a's value (10), then the extraFields nested array (one pair k=7).
			const stream = { data: [10, ["k", 7]], offset: 0 };
			const result = decoder.decode(decoders, stream);

			assertChunkCursorEquals(result, [
				{
					type: brand("MyNode"),
					value: "base-val",
					fields: {
						a: [{ type: brand("leaf"), value: 10 }],
						k: [{ type: brand("leaf"), value: 7 }],
					},
				},
			]);
			assert.equal(stream.offset, 2);
		});

		it("asserts when base index is out of bounds", () => {
			const context = makeContext([], []);
			assert.throws(
				() => new SpecializedNodeDecoder({ base: 0, fields: [] }, context),
				validateAssertionError("base shape index out of bounds"),
			);
		});

		it("asserts when base resolves to a non-node shape", () => {
			const shapes: EncodedChunkShapeVTextExperimental[] = [
				{ a: 0 }, // NestedArray shape, not a node shape
			];
			const context = makeContext([], shapes);
			assert.throws(
				() => new SpecializedNodeDecoder({ base: 0, fields: [] }, context),
				validateAssertionError("specialized node shape base must resolve to a node shape"),
			);
		});

		it("asserts on a cyclic f-chain", () => {
			const shapes: EncodedChunkShapeVTextExperimental[] = [
				{ f: { base: 1, fields: [] } },
				{ f: { base: 0, fields: [] } },
			];
			const context = makeContext([], shapes);
			assert.throws(
				() => new SpecializedNodeDecoder({ base: 0, fields: [] }, context),
				validateAssertionError("cyclic specialized node shape chain"),
			);
		});

		it("asserts on a self-referential f-chain", () => {
			const shapes: EncodedChunkShapeVTextExperimental[] = [{ f: { base: 0, fields: [] } }];
			const context = makeContext([], shapes);
			assert.throws(
				() => new SpecializedNodeDecoder({ base: 0, fields: [] }, context),
				validateAssertionError("cyclic specialized node shape chain"),
			);
		});

		it("asserts on duplicate keys in spec.fields", () => {
			const shapes: EncodedChunkShapeVTextExperimental[] = [
				{ c: { type: "MyNode", value: false, fields: [] } },
			];
			const context = makeContext([], shapes);
			assert.throws(
				() =>
					new SpecializedNodeDecoder(
						{
							base: 0,
							fields: [
								["k", 1],
								["k", 2],
							],
						},
						context,
					),
				validateAssertionError("duplicate field key in specialized node shape"),
			);
		});

		it("asserts on duplicate resolved keys in spec.fields (string vs identifier index)", () => {
			// Both ["k", 1] and [0, 2] resolve to the FieldKey "k" once context.identifier runs,
			// because identifiers[0] === "k". Without the resolved-key check, both entries would
			// silently be pushed into mergedFields.
			const shapes: EncodedChunkShapeVTextExperimental[] = [
				{ c: { type: "MyNode", value: false, fields: [] } },
			];
			const context = makeContext(["k"], shapes);
			assert.throws(
				() =>
					new SpecializedNodeDecoder(
						{
							base: 0,
							fields: [
								["k", 1],
								[0, 2],
							],
						},
						context,
					),
				validateAssertionError("duplicate field key in specialized node shape"),
			);
		});

		it("asserts on duplicate keys in base.fields", () => {
			const shapes: EncodedChunkShapeVTextExperimental[] = [
				{
					c: {
						type: "MyNode",
						value: false,
						fields: [
							["k", 1],
							["k", 2],
						],
					},
				},
			];
			const context = makeContext([], shapes);
			assert.throws(
				() => new SpecializedNodeDecoder({ base: 0, fields: [] }, context),
				validateAssertionError("duplicate field key in base node shape"),
			);
		});

		it("dispatches through top-level decode() when f shape is in the batch", () => {
			// shapes[0]: base FormatNode with one variable-boolean field "bold"
			// shapes[1]: variable boolean
			// shapes[2]: constant false boolean (0 stream tokens)
			// shapes[3]: f — overrides bold to always-false
			//
			// data: [[3]] — anyDecoder reads shape index 3, dispatching to the f decoder.
			// Bold is constant so nothing else is consumed; stream is fully exhausted.
			//
			// decode() does not inspect the version field at runtime, so v2 is used.
			// The value is already a branded type from strictEnum, so brand() is not needed here
			// (and would fail to infer T without contextual typing through the as unknown cast).
			const batch = {
				version: FieldBatchFormatVersion.v2,
				identifiers: [],
				shapes: [
					{ c: { type: "FormatNode", value: false, fields: [["bold", 1]] } },
					{ c: { type: "boolean", value: true } },
					{ c: { type: "boolean", value: [false] } },
					{ f: { base: 0, fields: [["bold", 2]] } },
				],
				data: [[3]],
			} as unknown as EncodedFieldBatchV1OrV2;

			const result = decode(batch, idDecodingContext);

			assert(result.length === 1);
			const chunk = result[0];
			assert(chunk !== undefined);
			assertChunkCursorEquals(chunk, [
				{
					type: brand("FormatNode"),
					fields: {
						bold: [{ type: brand("boolean"), value: false }],
					},
				},
			]);
		});
	});

	describe("EncodedIncrementalChunkShape", () => {
		const fieldBatchVersion = brand<FieldBatchFormatVersion>(FieldBatchFormatVersion.v2);

		function createMockIncrementalDecoder(
			chunksMap: Map<ChunkReferenceId, EncodedFieldBatchV1OrV2>,
		): IncrementalDecoder {
			return {
				decodeIncrementalChunk: (referenceId, chunkDecoder) => {
					const batch = chunksMap.get(referenceId);
					assert(batch !== undefined, `Chunk with reference ID ${referenceId} not found`);
					return chunkDecoder(batch);
				},
			};
		}

		function createMockEncodedIdentifierBatch(
			nodeIdentifier: TreeNodeSchemaIdentifier,
			value: TreeValue,
		): EncodedFieldBatchV1OrV2 {
			const shape: EncodedNodeShape = {
				type: nodeIdentifier,
				value: SpecialField.Identifier,
				fields: [],
			};
			return {
				version: fieldBatchVersion,
				identifiers: [],
				shapes: [
					{
						c: shape,
					},
				],
				data: [[0, value]],
			};
		}

		it("empty", () => {
			const referenceId = brand<ChunkReferenceId>(0);
			const emptyBatch: EncodedFieldBatchV1OrV2 = {
				version: fieldBatchVersion,
				identifiers: [],
				shapes: [{ a: 0 }],
				data: [[0, []]],
			};
			const chunksMap = new Map<ChunkReferenceId, EncodedFieldBatchV1OrV2>();
			chunksMap.set(referenceId, emptyBatch);

			const mockIncrementalDecoder = createMockIncrementalDecoder(chunksMap);
			const cache = new DecoderContext([], [], idDecodingContext, mockIncrementalDecoder);
			const decoder = new IncrementalChunkDecoder(cache);
			const stream = { data: [referenceId], offset: 0 };

			const result = decoder.decode([], stream);
			assert.equal(result, emptyChunk);
		});

		it("non-empty", () => {
			const referenceId = brand<ChunkReferenceId>(1);
			const compressedId = testIdCompressor.generateCompressedId();
			const nodeIdentifier: TreeNodeSchemaIdentifier = brand("identifier");
			const batch: EncodedFieldBatchV1OrV2 = createMockEncodedIdentifierBatch(
				nodeIdentifier,
				compressedId,
			);
			const chunksMap = new Map<ChunkReferenceId, EncodedFieldBatchV1OrV2>();

			chunksMap.set(referenceId, batch);
			const mockIncrementalDecoder = createMockIncrementalDecoder(chunksMap);
			const cache = new DecoderContext([], [], idDecodingContext, mockIncrementalDecoder);
			const decoder = new IncrementalChunkDecoder(cache);
			const stream = { data: [referenceId], offset: 0 };

			const result = decoder.decode([], stream);
			const expectedResult = new BasicChunk(
				nodeIdentifier,
				new Map(),
				testIdCompressor.decompress(compressedId),
			);
			assert.deepStrictEqual(result, expectedResult);
		});

		it("nested incremental chunk", () => {
			const referenceId1 = brand<ChunkReferenceId>(1);
			const referenceId2 = brand<ChunkReferenceId>(2);
			const nodeIdentifier: TreeNodeSchemaIdentifier = brand("identifier");
			// The encoded incremental chunk contains a nested array with another incremental chunk.
			const batch1: EncodedFieldBatchV1OrV2 = {
				version: fieldBatchVersion,
				identifiers: [],
				shapes: [
					{
						a: 1, // Nested array shape
					},
					{
						e: 0, // Incremental chunk shape inside the nested array
					},
				],
				data: [[0, [referenceId2]]],
			};

			const compressedId2 = testIdCompressor.generateCompressedId();
			const batch2: EncodedFieldBatchV1OrV2 = createMockEncodedIdentifierBatch(
				nodeIdentifier,
				compressedId2,
			);

			const chunksMap = new Map<ChunkReferenceId, EncodedFieldBatchV1OrV2>();
			chunksMap.set(referenceId1, batch1);
			chunksMap.set(referenceId2, batch2);

			const mockIncrementalDecoder = createMockIncrementalDecoder(chunksMap);
			const cache = new DecoderContext([], [], idDecodingContext, mockIncrementalDecoder);
			const decoder = new IncrementalChunkDecoder(cache);
			const stream = { data: [referenceId1], offset: 0 };

			const result = decoder.decode([], stream);
			const expectedResult = new BasicChunk(
				nodeIdentifier,
				new Map(),
				testIdCompressor.decompress(compressedId2),
			);
			assert.deepStrictEqual(result, expectedResult);
		});

		it("throws when incremental decoder is not available", () => {
			const cache = new DecoderContext(
				[],
				[],
				idDecodingContext,
				undefined, // No incremental decoder
			);

			const decoder = new IncrementalChunkDecoder(cache);
			const stream = { data: [42], offset: 0 };

			assert.throws(
				() => decoder.decode([], stream),
				validateAssertionError(
					"incremental decoder not available for incremental field decoding",
				),
			);
		});

		it("fails for unsupported FieldBatchFormatVersion.v1", () => {
			const referenceId = brand<ChunkReferenceId>(0);
			const emptyBatch: EncodedFieldBatchV1OrV2 = {
				version: brand(FieldBatchFormatVersion.v1),
				identifiers: [],
				shapes: [{ a: 0 }],
				data: [[0, []]],
			};
			const chunksMap = new Map<ChunkReferenceId, EncodedFieldBatchV1OrV2>();
			chunksMap.set(referenceId, emptyBatch);

			const mockIncrementalDecoder = createMockIncrementalDecoder(chunksMap);
			const cache = new DecoderContext([], [], idDecodingContext, mockIncrementalDecoder);
			const decoder = new IncrementalChunkDecoder(cache);
			const stream = { data: [referenceId], offset: 0 };

			assert.throws(
				() => decoder.decode([], stream),
				validateAssertionError(/Unsupported FieldBatchFormatVersion/),
			);
		});
	});
});
