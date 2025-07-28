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
	EncoderContext,
	type FieldEncoder,
	asFieldEncoder,
	// eslint-disable-next-line import/no-internal-modules
} from "../../../../feature-libraries/chunked-forest/codec/compressedEncode.js";
// eslint-disable-next-line import/no-internal-modules
import { NodeShapeBasedEncoder } from "../../../../feature-libraries/chunked-forest/codec/nodeEncoderGeneric.js";
// eslint-disable-next-line import/no-internal-modules
import { fieldKinds } from "../../../../feature-libraries/default-schema/index.js";
import { brand } from "../../../../util/index.js";

import { checkNodeEncode } from "./checkEncode.js";
import { testIdCompressor } from "../../../utils.js";

describe("nodeShape", () => {
	describe("NodeShapeBasedEncoder", () => {
		it("empty node", () => {
			const shape = new NodeShapeBasedEncoder(undefined, false, [], undefined);
			const identifierCounter = new Counter<string>();
			shape.countReferencedShapesAndIdentifiers(identifierCounter, () => fail());
			assert(identifierCounter.buildTable().indexToValue.length === 0);

			const context = new EncoderContext(
				() => fail(),
				() => fail(),
				fieldKinds,
				testIdCompressor,
			);

			const buffer = checkNodeEncode(shape, context, {
				type: brand("foo"),
			});
			assert.deepEqual(buffer, [new IdentifierToken("foo")]);
		});

		it("typed node with value", () => {
			const shape = new NodeShapeBasedEncoder(brand("foo"), true, [], undefined);

			const identifierCounter = new Counter<string>();
			shape.countReferencedShapesAndIdentifiers(identifierCounter, () => fail());
			const context = new EncoderContext(
				() => fail(),
				() => fail(),
				fieldKinds,
				testIdCompressor,
			);

			const encodedChunk = checkNodeEncode(shape, context, {
				type: brand("foo"),
				value: 5,
			});
			assert.deepEqual(encodedChunk, [5]);
		});

		it("dynamic", () => {
			const context = new EncoderContext(
				() => fail(),
				() => fail(),
				fieldKinds,
				testIdCompressor,
			);

			const fieldShapeLocal = context.nestedArrayEncoder(
				new NodeShapeBasedEncoder(undefined, false, [], undefined),
			);
			const shape = new NodeShapeBasedEncoder(undefined, undefined, [], fieldShapeLocal);

			const tree: JsonableTree = {
				type: brand("type"),
				value: "value",
				fields: {
					a: [{ type: brand("l1") }],
					b: [{ type: brand("l2") }, { type: brand("l3") }],
				},
			};

			const encodedChunk = checkNodeEncode(shape, context, tree);
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
			const context = new EncoderContext(
				() => fail(),
				() => fail(),
				fieldKinds,
				testIdCompressor,
			);

			// Shape which encodes to nothing.
			const fieldEncoder1: FieldEncoder = asFieldEncoder(
				new NodeShapeBasedEncoder(brand("1"), false, [], undefined),
			);
			// Shape which encodes to just the value.
			const shapeValueOnly = new NodeShapeBasedEncoder(brand("2"), true, [], undefined);

			// Shape which encodes to nested array of values.
			const shapeValues = context.nestedArrayEncoder(shapeValueOnly);

			// Shape which encodes to nested array of values.
			const shape = new NodeShapeBasedEncoder(
				brand("type"),
				true,
				[
					{ key: brand("nothing"), encoder: fieldEncoder1 },
					{ key: brand("shapeValueOnly"), encoder: asFieldEncoder(shapeValueOnly) },
					{ key: brand("shapeValues"), encoder: shapeValues },
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

			const encodedChunk = checkNodeEncode(shape, context, tree);
			assert.deepEqual(encodedChunk, ["value", "v", [6]]);
		});
	});
});
