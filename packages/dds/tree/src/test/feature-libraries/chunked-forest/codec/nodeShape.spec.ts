/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert, fail } from "node:assert";

import type { JsonableTree } from "../../../../core/index.js";
import {
	Counter,
	// eslint-disable-next-line import/no-internal-modules
} from "../../../../feature-libraries/chunked-forest/codec/chunkCodecUtilities.js";
import {
	IdentifierToken,
	// eslint-disable-next-line import/no-internal-modules
} from "../../../../feature-libraries/chunked-forest/codec/chunkEncodingGeneric.js";
import {
	EncoderCache,
	type FieldEncoder,
	asFieldEncoder,
	// eslint-disable-next-line import/no-internal-modules
} from "../../../../feature-libraries/chunked-forest/codec/compressedEncode.js";
// eslint-disable-next-line import/no-internal-modules
import { NodeShape } from "../../../../feature-libraries/chunked-forest/codec/nodeShape.js";
// eslint-disable-next-line import/no-internal-modules
import { fieldKinds } from "../../../../feature-libraries/default-schema/index.js";
import { brand } from "../../../../util/index.js";

import { checkNodeEncode } from "./checkEncode.js";
import { testIdCompressor } from "../../../utils.js";

describe("nodeShape", () => {
	describe("NodeShape", () => {
		it("empty node", () => {
			const shape = new NodeShape(undefined, false, [], undefined);
			const identifierCounter = new Counter<string>();
			shape.count(identifierCounter, () => fail());
			assert(identifierCounter.buildTable().indexToValue.length === 0);

			const cache = new EncoderCache(
				() => fail(),
				() => fail(),
				fieldKinds,
				testIdCompressor,
			);

			const buffer = checkNodeEncode(shape, cache, {
				type: brand("foo"),
			});
			assert.deepEqual(buffer, [new IdentifierToken("foo")]);
		});

		it("typed node with value", () => {
			const shape = new NodeShape(brand("foo"), true, [], undefined);

			const identifierCounter = new Counter<string>();
			shape.count(identifierCounter, () => fail());
			const cache = new EncoderCache(
				() => fail(),
				() => fail(),
				fieldKinds,
				testIdCompressor,
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
				fieldKinds,
				testIdCompressor,
			);

			const fieldShapeLocal = cache.nestedArray(
				new NodeShape(undefined, false, [], undefined),
			);
			const shape = new NodeShape(undefined, undefined, [], fieldShapeLocal);

			const tree: JsonableTree = {
				type: brand("type"),
				value: "value",
				fields: {
					a: [{ type: brand("l1") }],
					b: [{ type: brand("l2") }, { type: brand("l3") }],
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
			]);
		});

		it("fixed fields", () => {
			const cache = new EncoderCache(
				() => fail(),
				() => fail(),
				fieldKinds,
				testIdCompressor,
			);

			// Shape which encodes to nothing.
			const fieldShape1: FieldEncoder = asFieldEncoder(
				new NodeShape(brand("1"), false, [], undefined),
			);
			// Shape which encodes to just the value.
			const shapeValueOnly = new NodeShape(brand("2"), true, [], undefined);

			// Shape which encodes to nested array of values.
			const shapeValues = cache.nestedArray(shapeValueOnly);

			// Shape which encodes to nested array of values.
			const shape = new NodeShape(
				brand("type"),
				true,
				[
					{ key: brand("nothing"), shape: fieldShape1 },
					{ key: brand("shapeValueOnly"), shape: asFieldEncoder(shapeValueOnly) },
					{ key: brand("shapeValues"), shape: shapeValues },
				],
				undefined,
			);

			const tree: JsonableTree = {
				type: brand("type"),
				value: "value",
				fields: {
					nothing: [{ type: brand("1") }],
					shapeValueOnly: [{ type: brand("2"), value: "v" }],
					shapeValues: [{ type: brand("2"), value: 6 }],
				},
			};

			const encodedChunk = checkNodeEncode(shape, cache, tree);
			assert.deepEqual(encodedChunk, ["value", "v", [6]]);
		});
	});
});
