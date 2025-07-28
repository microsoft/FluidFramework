/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert, fail } from "node:assert";

import { compareArrays } from "@fluidframework/core-utils/internal";
import { MockHandle } from "@fluidframework/test-runtime-utils/internal";

import {
	type ICodecOptions,
	type IJsonCodec,
	makeVersionedValidatedCodec,
} from "../../../../codec/index.js";
import type {
	TreeFieldStoredSchema,
	TreeNodeSchemaIdentifier,
	Value,
} from "../../../../core/index.js";
import { typeboxValidator } from "../../../../external-utilities/index.js";
import {
	decode,
	readValue,
	// eslint-disable-next-line import/no-internal-modules
} from "../../../../feature-libraries/chunked-forest/codec/chunkDecoding.js";
import {
	type BufferFormat,
	IdentifierToken,
	updateShapesAndIdentifiersEncoding,
	// eslint-disable-next-line import/no-internal-modules
} from "../../../../feature-libraries/chunked-forest/codec/chunkEncodingGeneric.js";
import {
	EncoderContext,
	type FieldEncoder,
	type FieldShaper,
	InlineArrayEncoder,
	NestedArrayEncoder,
	type NodeEncoder,
	type TreeShaper,
	anyFieldEncoder,
	anyNodeEncoder,
	asNodesEncoder,
	compressedEncode,
	encodeValue,
	// eslint-disable-next-line import/no-internal-modules
} from "../../../../feature-libraries/chunked-forest/codec/compressedEncode.js";
import {
	type EncodedChunkShape,
	EncodedFieldBatch,
	type EncodedValueShape,
	validVersions,
	version,
	// eslint-disable-next-line import/no-internal-modules
} from "../../../../feature-libraries/chunked-forest/codec/format.js";
import {
	NodeShapeBasedEncoder,
	// eslint-disable-next-line import/no-internal-modules
} from "../../../../feature-libraries/chunked-forest/codec/nodeEncoderGeneric.js";
import type {
	FieldBatch,
	FieldBatchEncodingContext,
} from "../../../../feature-libraries/index.js";
import {
	TreeCompressionStrategy,
	cursorForJsonableTreeField,
	fieldKinds,
} from "../../../../feature-libraries/index.js";
import { type JsonCompatibleReadOnly, brand } from "../../../../util/index.js";
import { testTrees as schemalessTestTrees } from "../../../cursorTestSuite.js";
import { takeJsonSnapshot, useSnapshotDirectory } from "../../../snapshots/index.js";
import { jsonableTreesFromFieldCursor } from "../fieldCursorTestUtilities.js";

import { checkFieldEncode, checkNodeEncode } from "./checkEncode.js";
import { testIdCompressor } from "../../../utils.js";

const anyNodeShape = new NodeShapeBasedEncoder(undefined, undefined, [], anyFieldEncoder);
const onlyTypeShape = new NodeShapeBasedEncoder(undefined, false, [], undefined);

const constantFooShape = new NodeShapeBasedEncoder(brand("foo"), false, [], undefined);

function makeFieldBatchCodec(
	options: ICodecOptions,
	encoderContext: EncoderContext,
): IJsonCodec<
	FieldBatch,
	EncodedFieldBatch,
	JsonCompatibleReadOnly,
	FieldBatchEncodingContext
> {
	return makeVersionedValidatedCodec(options, validVersions, EncodedFieldBatch, {
		encode: (
			data: FieldBatch,
			fieldBatchContext: FieldBatchEncodingContext,
		): EncodedFieldBatch => {
			return compressedEncode(data, encoderContext);
		},
		decode: (
			data: EncodedFieldBatch,
			fieldBatchContext: FieldBatchEncodingContext,
		): FieldBatch => {
			// TODO: consider checking data is in schema.
			return decode(data, {
				idCompressor: fieldBatchContext.idCompressor,
				originatorId: fieldBatchContext.originatorId,
			}).map((chunk) => chunk.cursor());
		},
	});
}

describe("compressedEncode", () => {
	// This is a good smoke test for compressedEncode,
	// but also provides good coverage of anyNodeEncoder, anyFieldEncoder as well as AnyShape which they are built on.
	describe("schemaless test trees", () => {
		useSnapshotDirectory("chunked-forest-compressed-schemaless");
		for (const [name, jsonable] of schemalessTestTrees) {
			it(name, () => {
				const input: FieldBatch = [cursorForJsonableTreeField([jsonable])];
				const context = new EncoderContext(
					(fieldShaper: FieldShaper, schemaName: TreeNodeSchemaIdentifier): NodeEncoder =>
						anyNodeShape,
					(treeShaper: TreeShaper, field: TreeFieldStoredSchema): FieldEncoder =>
						anyFieldEncoder,
					fieldKinds,
					testIdCompressor,
				);
				const codec = makeFieldBatchCodec({ jsonValidator: typeboxValidator }, context);
				const result = codec.encode(input, {
					encodeType: TreeCompressionStrategy.Compressed,
					idCompressor: testIdCompressor,
					originatorId: testIdCompressor.localSessionId,
				});
				const decoded = codec.decode(result, {
					encodeType: TreeCompressionStrategy.Compressed,
					idCompressor: testIdCompressor,
					originatorId: testIdCompressor.localSessionId,
				});
				const decodedJson = decoded.map(jsonableTreesFromFieldCursor);
				assert.deepEqual([[jsonable]], decodedJson);

				// This makes it clear when the format changes.
				// This can include compression/heuristic changes which are non breaking,
				// but does not handle ensuring different old versions stull load (for example encoded with different heuristics).
				// TODO: add a new test suite with a library of encoded test data which we can parse to cover that.
				takeJsonSnapshot(result);
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
				const processed = updateShapesAndIdentifiersEncoding(version, [buffer]);
				assert(processed.data.length === 1);
				const stream = { data: processed.data[0], offset: 0 };
				const decoded = readValue(stream, shape, {
					idCompressor: testIdCompressor,
					originatorId: testIdCompressor.localSessionId,
				});
				assert(stream.offset === stream.data.length);
				assert.deepEqual(decoded, value);
			});
		}
	});

	it("anyNodeEncoder", () => {
		const context = new EncoderContext(
			() => anyNodeShape,
			() => fail(),
			fieldKinds,
			testIdCompressor,
		);
		const buffer = checkNodeEncode(anyNodeEncoder, context, { type: brand("foo") });
		assert.deepEqual(buffer, [anyNodeShape, new IdentifierToken("foo"), false, []]);
	});

	describe("InlineArrayEncoder", () => {
		it("empty", () => {
			const context = new EncoderContext(
				() => fail(),
				() => fail(),
				fieldKinds,
				testIdCompressor,
			);
			const buffer = checkFieldEncode(InlineArrayEncoder.empty, context, []);
			assert(compareArrays(buffer, []));
		});

		it("non-empty", () => {
			const context = new EncoderContext(
				() => fail(),
				() => fail(),
				fieldKinds,
				testIdCompressor,
			);
			const shape = new InlineArrayEncoder(1, asNodesEncoder(onlyTypeShape));
			const buffer = checkFieldEncode(shape, context, [{ type: brand("foo") }]);
			assert.deepEqual(buffer, [new IdentifierToken("foo")]);
		});

		it("multiple", () => {
			const context = new EncoderContext(
				() => fail(),
				() => fail(),
				fieldKinds,
				testIdCompressor,
			);
			const shape = new InlineArrayEncoder(2, asNodesEncoder(onlyTypeShape));
			const buffer = checkFieldEncode(shape, context, [
				{ type: brand("foo") },
				{ type: brand("bar") },
			]);
			assert.deepEqual(buffer, [new IdentifierToken("foo"), new IdentifierToken("bar")]);
		});

		it("nested", () => {
			const context = new EncoderContext(
				() => fail(),
				() => fail(),
				fieldKinds,
				testIdCompressor,
			);
			const shapeInner = new InlineArrayEncoder(2, asNodesEncoder(onlyTypeShape));
			const shapeOuter = new InlineArrayEncoder(2, shapeInner);
			const buffer = checkFieldEncode(shapeOuter, context, [
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

	describe("NestedArrayEncoder", () => {
		it("empty", () => {
			const context = new EncoderContext(
				() => fail(),
				() => fail(),
				fieldKinds,
				testIdCompressor,
			);
			const buffer = checkFieldEncode(new NestedArrayEncoder(onlyTypeShape), context, []);
			assert.deepEqual(buffer, [0]);
		});

		it("non-empty", () => {
			const context = new EncoderContext(
				() => fail(),
				() => fail(),
				fieldKinds,
				testIdCompressor,
			);
			const shape = new NestedArrayEncoder(onlyTypeShape);
			const buffer = checkFieldEncode(shape, context, [{ type: brand("foo") }]);
			assert.deepEqual(buffer, [[new IdentifierToken("foo")]]);
		});

		it("multiple", () => {
			const context = new EncoderContext(
				() => fail(),
				() => fail(),
				fieldKinds,
				testIdCompressor,
			);
			const shape = new NestedArrayEncoder(onlyTypeShape);
			const buffer = checkFieldEncode(shape, context, [
				{ type: brand("foo") },
				{ type: brand("bar") },
			]);
			assert.deepEqual(buffer, [[new IdentifierToken("foo"), new IdentifierToken("bar")]]);
		});

		// tests for case where child items have 0 encoded size: length can't be inferred from nested array so number is used instead.
		it("single zero sized content", () => {
			const context = new EncoderContext(
				() => fail(),
				() => fail(),
				fieldKinds,
				testIdCompressor,
			);
			const buffer = checkFieldEncode(new NestedArrayEncoder(constantFooShape), context, [
				{ type: brand("foo") },
			]);
			assert(compareArrays(buffer, [1]));
		});

		it("multiple zero sized content", () => {
			const context = new EncoderContext(
				() => fail(),
				() => fail(),
				fieldKinds,
				testIdCompressor,
			);
			const buffer = checkFieldEncode(new NestedArrayEncoder(constantFooShape), context, [
				{ type: brand("foo") },
				{ type: brand("foo") },
				{ type: brand("foo") },
			]);
			assert(compareArrays(buffer, [3]));
		});
	});

	describe("anyFieldEncoder", () => {
		it("empty", () => {
			const context = new EncoderContext(
				() => fail(),
				() => fail(),
				fieldKinds,
				testIdCompressor,
			);
			const buffer = checkFieldEncode(anyFieldEncoder, context, []);
			// For size purposes, this should remain true
			assert.equal(
				buffer.length,
				1,
				"empty field should only take up one space in the output",
			);
			// The exact encoding schema here is not important as long as the above holds (and the entry here is small):
			// The current encoding scheme uses an empty inline array for encoding 0 size fields:
			assert(compareArrays(buffer, [InlineArrayEncoder.empty]));
		});

		it("one item", () => {
			const context = new EncoderContext(
				() => onlyTypeShape,
				() => fail(),
				fieldKinds,
				testIdCompressor,
			);
			const buffer = checkFieldEncode(anyFieldEncoder, context, [{ type: brand("foo") }]);
			// Should use anyNodeEncoder, which will lookup the shape from context:
			assert.deepEqual(buffer, [onlyTypeShape, new IdentifierToken("foo")]);
		});

		it("multi item", () => {
			const context = new EncoderContext(
				() => onlyTypeShape,
				() => fail(),
				fieldKinds,
				testIdCompressor,
			);
			const buffer = checkFieldEncode(anyFieldEncoder, context, [
				{ type: brand("foo") },
				{ type: brand("bar") },
			]);
			// Should use nestedArray, which will lookup the shape from context:
			assert.deepEqual(buffer, [
				context.nestedArrayEncoder(anyNodeEncoder),
				[onlyTypeShape, new IdentifierToken("foo"), onlyTypeShape, new IdentifierToken("bar")],
			]);
		});
	});
});
