/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert, fail } from "assert";
// eslint-disable-next-line import/no-internal-modules
import { NodeShape } from "../../../../feature-libraries/chunked-forest/codec/nodeShape";
import {
	BufferFormat,
	EncoderCache,
	// eslint-disable-next-line import/no-internal-modules
} from "../../../../feature-libraries/chunked-forest/codec/compressedEncode";
import {
	Counter,
	CounterFilter,
	// eslint-disable-next-line import/no-internal-modules
} from "../../../../feature-libraries/chunked-forest/codec/chunkCodecUtilities";
import {
	IdentifierToken,
	handleShapesAndIdentifiers,
	// eslint-disable-next-line import/no-internal-modules
} from "../../../../feature-libraries/chunked-forest/codec/chunkEncodingGeneric";
import {
	EncodedChunk,
	version,
	// eslint-disable-next-line import/no-internal-modules
} from "../../../../feature-libraries/chunked-forest/codec/format";
import { JsonableTree } from "../../../../core";
import { brand } from "../../../../util";
import { assertChunkCursorEquals } from "../fieldCursorTestUtilities";
import { singleTextCursor } from "../../../../feature-libraries";
// eslint-disable-next-line import/no-internal-modules
import { decode } from "../../../../feature-libraries/chunked-forest/codec/chunkDecoding";

describe("nodeShape", () => {
	describe("NodeShape", () => {
		// const cases: [string, NodeShape, JsonableTree];

		function checkEncode(
			shape: NodeShape,
			cache: EncoderCache,
			tree: JsonableTree,
		): BufferFormat {
			const buffer: BufferFormat = [shape];
			const cursor = singleTextCursor(tree);
			shape.encodeNodes(cursor, cache, buffer);

			// Check round-trips with identifiers inline and out of line
			checkDecode(buffer, tree, () => false);
			checkDecode(buffer, tree, () => true);

			return buffer.slice(1);
		}

		// Clones anything handleShapesAndIdentifiers might modify in-place.
		function cloneArrays<T>(data: readonly T[]): T[] {
			return data.map((item) => (Array.isArray(item) ? cloneArrays(item) : item)) as T[];
		}

		function checkDecode(
			buffer: BufferFormat,
			tree: JsonableTree,
			identifierFilter: CounterFilter<string>,
		): EncodedChunk {
			const chunk = handleShapesAndIdentifiers(
				version,
				cloneArrays(buffer),
				identifierFilter,
			);

			// Check decode
			const result = decode(chunk);
			assertChunkCursorEquals(result, [tree]);
			return chunk;
		}

		// const childShape: FieldEncoderShape = InlineArrayShape.empty;

		const emptyChunk: EncodedChunk = {
			version: "unstable-development",
			identifiers: [],
			shapes: [],
			data: [],
		};

		it("empty node", () => {
			const shape = new NodeShape(undefined, false, [], [], undefined, undefined);
			const identifierCounter = new Counter<string>();
			shape.count(identifierCounter, () => fail());
			assert(identifierCounter.buildTable().indexToValue.length === 0);

			const cache = new EncoderCache(
				() => fail(),
				() => fail(),
			);

			const buffer = checkEncode(shape, cache, {
				type: brand("foo"),
			});
			assert.deepEqual(buffer, [new IdentifierToken("foo")]);
		});

		it("typed node with value", () => {
			const shape = new NodeShape(brand("foo"), true, [], [], undefined, undefined);

			const identifierCounter = new Counter<string>();
			shape.count(identifierCounter, () => fail());
			const cache = new EncoderCache(
				() => fail(),
				() => fail(),
			);

			const encodedChunk = checkEncode(shape, cache, {
				type: brand("foo"),
				value: 5,
			});
			assert.deepEqual(encodedChunk, [5]);
		});

		it("dynamic", () => {
			const cache = new EncoderCache(
				() => fail(),
				() => fail(),
			);

			// Different shapes for local and global extra fields so we can ensure the correct shape is used for each.
			const fieldShapeLocal = cache.nestedArray(
				new NodeShape(undefined, false, [], [], undefined, undefined),
			);
			const fieldShapeGlobal = cache.nestedArray(
				new NodeShape(undefined, [5], [], [], undefined, undefined),
			);
			const shape = new NodeShape(
				undefined,
				undefined,
				[],
				[],
				fieldShapeLocal,
				fieldShapeGlobal,
			);

			const tree: JsonableTree = {
				type: brand("type"),
				value: "value",
				fields: {
					a: [{ type: brand("l1") }],
					b: [{ type: brand("l2") }, { type: brand("l3") }],
				},
				globalFields: {
					c: [{ type: brand("g1"), value: 5 }],
					d: [{ type: brand("g2"), value: 5 }],
				},
			};

			const encodedChunk = checkEncode(shape, cache, tree);
			assert.deepEqual(encodedChunk, [
				new IdentifierToken("type"),
				true,
				"value",
				[
					new IdentifierToken("a"),
					[new IdentifierToken("l1")],
					new IdentifierToken("b"),
					[new IdentifierToken("l2"), new IdentifierToken("l3")],
				],
				[
					new IdentifierToken("c"),
					[new IdentifierToken("g1")],
					new IdentifierToken("d"),
					[new IdentifierToken("g2")],
				],
			]);
		});

		// it("fixed fields", () => {
		// 	const cache = new DecoderCache(["key"], []);
		// 	const log: string[] = [];
		// 	const localChunk = new BasicChunk(brand("local"), new Map());
		// 	const globalChunk = new BasicChunk(brand("global"), new Map());
		// 	const decoders = [
		// 		makeLoggingDecoder(log, localChunk),
		// 		makeLoggingDecoder(log, globalChunk),
		// 	];
		// 	const decoder = new TreeDecoder(
		// 		{
		// 			local: [{ shape: 0, key: 0 }],
		// 			global: [{ shape: 1, key: 0 }],
		// 			value: false,
		// 		},
		// 		cache,
		// 	);
		// 	const stream = {
		// 		data: ["type", "l1", "g1"],
		// 		offset: 0,
		// 	};
		// 	const result = decoder.decode(decoders, stream);
		// 	assertChunkCursorEquals(result, [
		// 		{
		// 			type: brand("type"),
		// 			value: "value",
		// 			fields: {
		// 				key: [{ type: brand("local") }],
		// 			},
		// 			globalFields: {
		// 				key: [{ type: brand("global") }],
		// 			},
		// 		},
		// 	]);
		// 	assert.deepEqual(log, ["l1", "g1"]);
		// });
	});
});
