/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert, fail } from "assert";
// eslint-disable-next-line import/no-internal-modules
import { NodeShape } from "../../../../feature-libraries/chunked-forest/codec/nodeShape";
import {
	EncoderCache,
	FieldEncoderShape,
	asFieldEncoder,
	// eslint-disable-next-line import/no-internal-modules
} from "../../../../feature-libraries/chunked-forest/codec/compressedEncode";
import {
	Counter,
	// eslint-disable-next-line import/no-internal-modules
} from "../../../../feature-libraries/chunked-forest/codec/chunkCodecUtilities";
import {
	IdentifierToken,
	// eslint-disable-next-line import/no-internal-modules
} from "../../../../feature-libraries/chunked-forest/codec/chunkEncodingGeneric";
import { JsonableTree } from "../../../../core";
import { brand } from "../../../../util";
import { checkNodeEncode } from "./checkEncode";

describe("nodeShape", () => {
	describe("NodeShape", () => {
		it("empty node", () => {
			const shape = new NodeShape(undefined, false, [], [], undefined, undefined);
			const identifierCounter = new Counter<string>();
			shape.count(identifierCounter, () => fail());
			assert(identifierCounter.buildTable().indexToValue.length === 0);

			const cache = new EncoderCache(
				() => fail(),
				() => fail(),
			);

			const buffer = checkNodeEncode(shape, cache, {
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

			const encodedChunk = checkNodeEncode(shape, cache, {
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

			const encodedChunk = checkNodeEncode(shape, cache, tree);
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

		it("fixed fields", () => {
			const cache = new EncoderCache(
				() => fail(),
				() => fail(),
			);

			// Shape which encodes to nothing.
			const fieldShape1: FieldEncoderShape = asFieldEncoder(
				new NodeShape(brand("1"), false, [], [], undefined, undefined),
			);
			// Shape which encodes to just the value.
			const shapeValueOnly = new NodeShape(brand("2"), true, [], [], undefined, undefined);

			// Shape which encodes to nested array of values.
			const shapeValues = cache.nestedArray(shapeValueOnly);

			// Shape which encodes to nested array of values.
			const shape = new NodeShape(
				brand("type"),
				true,
				[
					{ key: brand("nothing"), shape: fieldShape1 },
					{ key: brand("shapeValueOnly"), shape: asFieldEncoder(shapeValueOnly) },
				],
				[{ key: brand("shapeValues"), shape: shapeValues }],
				undefined,
				undefined,
			);

			const tree: JsonableTree = {
				type: brand("type"),
				value: "value",
				fields: {
					nothing: [{ type: brand("1") }],
					shapeValueOnly: [{ type: brand("2"), value: "v" }],
				},
				globalFields: {
					shapeValues: [{ type: brand("2"), value: 6 }],
				},
			};

			const encodedChunk = checkNodeEncode(shape, cache, tree);
			assert.deepEqual(encodedChunk, ["value", "v", [6]]);
		});
	});
});
