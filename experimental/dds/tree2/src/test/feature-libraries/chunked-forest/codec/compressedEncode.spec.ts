/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "assert";

import {
	decode,
	readValue,
	// eslint-disable-next-line import/no-internal-modules
} from "../../../../feature-libraries/chunked-forest/codec/chunkDecoding";
import {
	NodeShape,
	// eslint-disable-next-line import/no-internal-modules
} from "../../../../feature-libraries/chunked-forest/codec/nodeShape";
import {
	EncoderCache,
	FieldEncoderShape,
	FieldShaper,
	NodeEncoderShape,
	TreeShaper,
	anyFieldEncoder,
	compressedEncode,
	encodeValue,
	// eslint-disable-next-line import/no-internal-modules
} from "../../../../feature-libraries/chunked-forest/codec/compressedEncode";
import { testTrees } from "../../../cursorTestSuite";
import {
	fieldCursorFromJsonableTrees,
	jsonableTreesFromFieldCursor,
} from "../fieldCursorTestUtilities";
import { FieldStoredSchema, TreeSchemaIdentifier, TreeValue } from "../../../../core";
import {
	EncodedChunkShape,
	EncodedValueShape,
	version,
	// eslint-disable-next-line import/no-internal-modules
} from "../../../../feature-libraries/chunked-forest/codec/format";
import {
	BufferFormat,
	handleShapesAndIdentifiers,
	// eslint-disable-next-line import/no-internal-modules
} from "../../../../feature-libraries/chunked-forest/codec/chunkEncodingGeneric";

const anyNodeShape = new NodeShape(undefined, undefined, [], [], anyFieldEncoder, anyFieldEncoder);

describe("compressedEncode", () => {
	// This is a good smoke test for compressedEncode,
	// but also provides good coverage of anyNodeEncoder, anyFieldEncoder as well as AnyShape which they are built on.
	describe("test trees", () => {
		for (const [name, jsonable] of testTrees) {
			it(name, () => {
				const input = fieldCursorFromJsonableTrees([jsonable]);
				const cache = new EncoderCache(
					(
						fieldShaper: FieldShaper,
						schemaName: TreeSchemaIdentifier,
					): NodeEncoderShape => anyNodeShape,
					(treeShaper: TreeShaper, field: FieldStoredSchema): FieldEncoderShape =>
						anyFieldEncoder,
				);
				const result = compressedEncode(input, cache);
				const decoded = decode(result);
				const decodedJson = jsonableTreesFromFieldCursor(decoded.cursor());
				assert.deepEqual([jsonable], decodedJson);
			});
		}
	});

	describe("encodeValue", () => {
		const testValues: [
			string,
			TreeValue,
			EncodedValueShape,
			BufferFormat<EncodedChunkShape>,
		][] = [
			["none", undefined, false, []],
			["none-optional", undefined, undefined, [false]],
			["false-optional", false, undefined, [false]],
			["object-optional", { foo: 0 }, undefined, [true, { foo: 0 }]],
			["required-boolean", false, true, [false]],
			["constant", 5, [5], []],
		];
		for (const [name, value, shape, encoded] of testValues) {
			it(name, () => {
				const buffer: BufferFormat<EncodedChunkShape> = [];
				encodeValue(value, shape, buffer);
				assert.deepEqual(buffer, encoded);
				const processed = handleShapesAndIdentifiers(version, buffer);
				const stream = { data: processed.data, offset: 0 };
				const decoded = readValue(stream, shape);
				assert(stream.offset === stream.data.length);
				assert.deepEqual(decoded, value);
			});
		}
	});

	// TODO: populate these tests
	describe("anyFieldEncoder", () => {});
	describe("InlineArrayShape", () => {});
	describe("NestedArrayShape", () => {});
	// TODO: be sure to test recursive case to test laziness
	describe("EncoderCache", () => {});
});
