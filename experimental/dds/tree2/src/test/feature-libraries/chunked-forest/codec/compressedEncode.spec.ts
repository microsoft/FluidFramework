/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert, fail } from "assert";

import { compareArrays } from "@fluidframework/core-utils";
import { MockHandle } from "@fluidframework/test-runtime-utils";
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
	FieldEncoder,
	FieldShaper,
	InlineArrayShape,
	NestedArrayShape,
	NodeEncoder,
	TreeShaper,
	anyFieldEncoder,
	anyNodeEncoder,
	asNodesEncoder,
	compressedEncode,
	encodeValue,
	// eslint-disable-next-line import/no-internal-modules
} from "../../../../feature-libraries/chunked-forest/codec/compressedEncode";
import { testTrees } from "../../../cursorTestSuite";
import { jsonableTreesFromFieldCursor } from "../fieldCursorTestUtilities";
import { TreeFieldStoredSchema, TreeNodeSchemaIdentifier, Value } from "../../../../core";
import {
	EncodedChunkShape,
	EncodedFieldBatch,
	EncodedValueShape,
	validVersions,
	version,
	// eslint-disable-next-line import/no-internal-modules
} from "../../../../feature-libraries/chunked-forest/codec/format";
import {
	BufferFormat,
	IdentifierToken,
	handleShapesAndIdentifiers,
	// eslint-disable-next-line import/no-internal-modules
} from "../../../../feature-libraries/chunked-forest/codec/chunkEncodingGeneric";
import { JsonCompatibleReadOnly, brand } from "../../../../util";
import { typeboxValidator } from "../../../../external-utilities";
import { cursorForJsonableTreeField } from "../../../../feature-libraries";
// eslint-disable-next-line import/no-internal-modules
import { fieldKinds } from "../../../../feature-libraries/default-schema";
// eslint-disable-next-line import/no-internal-modules
import { FieldBatch } from "../../../../feature-libraries/chunked-forest";
import { ICodecOptions, IJsonCodec } from "../../../../codec";
// eslint-disable-next-line import/no-internal-modules
import { makeVersionedValidatedCodec } from "../../../../feature-libraries/versioned";
import { checkFieldEncode, checkNodeEncode } from "./checkEncode";

const anyNodeShape = new NodeShape(undefined, undefined, [], anyFieldEncoder);
const onlyTypeShape = new NodeShape(undefined, false, [], undefined);

const constantFooShape = new NodeShape(brand("foo"), false, [], undefined);

export function makeFieldBatchCodec(
	options: ICodecOptions,
	cache: EncoderCache,
): IJsonCodec<FieldBatch, EncodedFieldBatch, JsonCompatibleReadOnly> {
	return makeVersionedValidatedCodec(options, validVersions, EncodedFieldBatch, {
		encode: (data: FieldBatch): EncodedFieldBatch => {
			return compressedEncode(data, cache);
		},
		decode: (data: EncodedFieldBatch): FieldBatch => {
			// TODO: consider checking data is in schema.
			return decode(data).map((chunk) => chunk.cursor());
		},
	});
}

describe("compressedEncode", () => {
	// This is a good smoke test for compressedEncode,
	// but also provides good coverage of anyNodeEncoder, anyFieldEncoder as well as AnyShape which they are built on.
	describe("test trees", () => {
		for (const [name, jsonable] of testTrees) {
			it(name, () => {
				const input: FieldBatch = [cursorForJsonableTreeField([jsonable])];
				const cache = new EncoderCache(
					(fieldShaper: FieldShaper, schemaName: TreeNodeSchemaIdentifier): NodeEncoder =>
						anyNodeShape,
					(treeShaper: TreeShaper, field: TreeFieldStoredSchema): FieldEncoder =>
						anyFieldEncoder,
					fieldKinds,
				);
				const codec = makeFieldBatchCodec({ jsonValidator: typeboxValidator }, cache);
				const result = codec.encode(input);
				const decoded = codec.decode(result);
				const decodedJson = decoded.map(jsonableTreesFromFieldCursor);
				assert.deepEqual([[jsonable]], decodedJson);
			});
		}
	});

	const mockHandle = new MockHandle("x");

	describe("encodeValue", () => {
		const testValues: [string, Value, EncodedValueShape, BufferFormat<EncodedChunkShape>][] = [
			["none", undefined, false, []],
			["optional none", undefined, undefined, [false]],
			["optional some", 5, undefined, [true, 5]],
			["handle", mockHandle, undefined, [true, mockHandle]],
			["required", false, true, [false]],
			["constant", 5, [5], []],
		];
		for (const [name, value, shape, encoded] of testValues) {
			it(name, () => {
				const buffer: BufferFormat<EncodedChunkShape> = [];
				encodeValue(value, shape, buffer);
				assert.deepEqual(buffer, encoded);
				const processed = handleShapesAndIdentifiers(version, [buffer]);
				assert(processed.data.length === 1);
				const stream = { data: processed.data[0], offset: 0 };
				const decoded = readValue(stream, shape);
				assert(stream.offset === stream.data.length);
				assert.deepEqual(decoded, value);
			});
		}
	});

	it("anyNodeEncoder", () => {
		const cache = new EncoderCache(
			() => anyNodeShape,
			() => fail(),
			fieldKinds,
		);
		const buffer = checkNodeEncode(anyNodeEncoder, cache, { type: brand("foo") });
		assert.deepEqual(buffer, [anyNodeShape, new IdentifierToken("foo"), false, []]);
	});

	describe("InlineArrayShape", () => {
		it("empty", () => {
			const cache = new EncoderCache(
				() => fail(),
				() => fail(),
				fieldKinds,
			);
			const buffer = checkFieldEncode(InlineArrayShape.empty, cache, []);
			assert(compareArrays(buffer, []));
		});

		it("non-empty", () => {
			const cache = new EncoderCache(
				() => fail(),
				() => fail(),
				fieldKinds,
			);
			const shape = new InlineArrayShape(1, asNodesEncoder(onlyTypeShape));
			const buffer = checkFieldEncode(shape, cache, [{ type: brand("foo") }]);
			assert.deepEqual(buffer, [new IdentifierToken("foo")]);
		});

		it("multiple", () => {
			const cache = new EncoderCache(
				() => fail(),
				() => fail(),
				fieldKinds,
			);
			const shape = new InlineArrayShape(2, asNodesEncoder(onlyTypeShape));
			const buffer = checkFieldEncode(shape, cache, [
				{ type: brand("foo") },
				{ type: brand("bar") },
			]);
			assert.deepEqual(buffer, [new IdentifierToken("foo"), new IdentifierToken("bar")]);
		});

		it("nested", () => {
			const cache = new EncoderCache(
				() => fail(),
				() => fail(),
				fieldKinds,
			);
			const shapeInner = new InlineArrayShape(2, asNodesEncoder(onlyTypeShape));
			const shapeOuter = new InlineArrayShape(2, shapeInner);
			const buffer = checkFieldEncode(shapeOuter, cache, [
				{ type: brand("a") },
				{ type: brand("b") },
				{ type: brand("c") },
				{ type: brand("d") },
			]);
			assert.deepEqual(buffer, [
				new IdentifierToken("a"),
				new IdentifierToken("b"),
				new IdentifierToken("c"),
				new IdentifierToken("d"),
			]);
		});
	});

	describe("NestedArrayShape", () => {
		it("empty", () => {
			const cache = new EncoderCache(
				() => fail(),
				() => fail(),
				fieldKinds,
			);
			const buffer = checkFieldEncode(new NestedArrayShape(onlyTypeShape), cache, []);
			assert.deepEqual(buffer, [0]);
		});

		it("non-empty", () => {
			const cache = new EncoderCache(
				() => fail(),
				() => fail(),
				fieldKinds,
			);
			const shape = new NestedArrayShape(onlyTypeShape);
			const buffer = checkFieldEncode(shape, cache, [{ type: brand("foo") }]);
			assert.deepEqual(buffer, [[new IdentifierToken("foo")]]);
		});

		it("multiple", () => {
			const cache = new EncoderCache(
				() => fail(),
				() => fail(),
				fieldKinds,
			);
			const shape = new NestedArrayShape(onlyTypeShape);
			const buffer = checkFieldEncode(shape, cache, [
				{ type: brand("foo") },
				{ type: brand("bar") },
			]);
			assert.deepEqual(buffer, [[new IdentifierToken("foo"), new IdentifierToken("bar")]]);
		});

		// tests for case where child items have 0 encoded size: length can't be inferred from nested array so number is used instead.
		it("single zero sized content", () => {
			const cache = new EncoderCache(
				() => fail(),
				() => fail(),
				fieldKinds,
			);
			const buffer = checkFieldEncode(new NestedArrayShape(constantFooShape), cache, [
				{ type: brand("foo") },
			]);
			assert(compareArrays(buffer, [1]));
		});

		it("multiple zero sized content", () => {
			const cache = new EncoderCache(
				() => fail(),
				() => fail(),
				fieldKinds,
			);
			const buffer = checkFieldEncode(new NestedArrayShape(constantFooShape), cache, [
				{ type: brand("foo") },
				{ type: brand("foo") },
				{ type: brand("foo") },
			]);
			assert(compareArrays(buffer, [3]));
		});
	});

	describe("anyFieldEncoder", () => {
		it("empty", () => {
			const cache = new EncoderCache(
				() => fail(),
				() => fail(),
				fieldKinds,
			);
			const buffer = checkFieldEncode(anyFieldEncoder, cache, []);
			// For size purposes, this should remain true
			assert.equal(
				buffer.length,
				1,
				"empty field should only take up one space in the output",
			);
			// The exact encoding schema here is not important as long as the above holds (and the entry here is small):
			// The current encoding scheme uses an empty inline array for encoding 0 size fields:
			assert(compareArrays(buffer, [InlineArrayShape.empty]));
		});

		it("one item", () => {
			const cache = new EncoderCache(
				() => onlyTypeShape,
				() => fail(),
				fieldKinds,
			);
			const buffer = checkFieldEncode(anyFieldEncoder, cache, [{ type: brand("foo") }]);
			// Should use anyNodeEncoder, which will lookup the shape from cache:
			assert.deepEqual(buffer, [onlyTypeShape, new IdentifierToken("foo")]);
		});

		it("multi item", () => {
			const cache = new EncoderCache(
				() => onlyTypeShape,
				() => fail(),
				fieldKinds,
			);
			const buffer = checkFieldEncode(anyFieldEncoder, cache, [
				{ type: brand("foo") },
				{ type: brand("bar") },
			]);
			// Should use nestedArray, which will lookup the shape from cache:
			assert.deepEqual(buffer, [
				cache.nestedArray(anyNodeEncoder),
				[
					onlyTypeShape,
					new IdentifierToken("foo"),
					onlyTypeShape,
					new IdentifierToken("bar"),
				],
			]);
		});
	});
});
