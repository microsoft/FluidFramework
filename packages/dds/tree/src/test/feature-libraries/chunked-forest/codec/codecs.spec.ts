/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "node:assert";

import { validateAssertionError } from "@fluidframework/test-runtime-utils/internal";

import { currentVersion, FluidClientVersion } from "../../../../codec/index.js";
import type { JsonableTree } from "../../../../core/index.js";
import {
	fieldBatchCodecBuilder,
	// eslint-disable-next-line import-x/no-internal-modules
} from "../../../../feature-libraries/chunked-forest/codec/codecs.js";
// eslint-disable-next-line import-x/no-internal-modules
import type { EncodedFieldBatchVTextExperimental } from "../../../../feature-libraries/chunked-forest/codec/format/index.js";
import {
	FieldBatchFormatVersion,
	// eslint-disable-next-line import-x/no-internal-modules
} from "../../../../feature-libraries/chunked-forest/codec/index.js";
import {
	TreeCompressionStrategy,
	cursorForJsonableTreeField,
	jsonableTreeFromFieldCursor,
} from "../../../../feature-libraries/index.js";
import { brand, type JsonCompatibleReadOnly } from "../../../../util/index.js";
import { ajvValidator } from "../../../codec/index.js";
import { testTrees } from "../../../cursorTestSuite.js";
import { snapshotCodecFormats, useSnapshotDirectory } from "../../../snapshots/index.js";
import { makeTestFieldBatchContexts, testIdCompressor } from "../../../utils.js";

describe("fieldBatchCodecBuilder", () => {
	// Use the first simple test tree from the test suite
	const [, simpleTestData] = testTrees[0];
	useSnapshotDirectory("codecFormats");
	it("snapshot of supported codec formats", () => {
		snapshotCodecFormats(fieldBatchCodecBuilder, {});
	});

	describe("version mapping", () => {
		it("uses v1 format for FluidClientVersion.v2_0", () => {
			const codec = fieldBatchCodecBuilder.build({
				jsonValidator: ajvValidator,
				oldestSupportedClient: FluidClientVersion.v2_0,
			});

			const input = cursorForJsonableTreeField([simpleTestData]);
			const context = {
				encodeType: TreeCompressionStrategy.Uncompressed,
				originatorId: testIdCompressor.localSessionId,
				isSummary: false,
				idCompressor: testIdCompressor,
			};

			const encoded = codec.encode([input], context);
			assert(encoded !== null && typeof encoded === "object" && "version" in encoded);
			assert.equal(encoded.version, FieldBatchFormatVersion.v1);
		});

		it("uses v2 format for FluidClientVersion.v2_74", () => {
			const codec = fieldBatchCodecBuilder.build({
				jsonValidator: ajvValidator,
				oldestSupportedClient: FluidClientVersion.v2_74,
			});

			const input = cursorForJsonableTreeField([simpleTestData]);
			const context = {
				encodeType: TreeCompressionStrategy.Uncompressed,
				originatorId: testIdCompressor.localSessionId,
				isSummary: false,
				idCompressor: testIdCompressor,
			};

			const encoded = codec.encode([input], context);
			assert(encoded !== null && typeof encoded === "object" && "version" in encoded);
			assert.equal(encoded.version, FieldBatchFormatVersion.v2);
		});

		it("can decode both formats when encoding either", () => {
			const codec1 = fieldBatchCodecBuilder.build({
				jsonValidator: ajvValidator,
				oldestSupportedClient: FluidClientVersion.v2_0,
			});
			const codec2 = fieldBatchCodecBuilder.build({
				jsonValidator: ajvValidator,
				oldestSupportedClient: FluidClientVersion.v2_74,
			});

			const { encode, decode } = makeTestFieldBatchContexts({
				encodeType: TreeCompressionStrategy.Uncompressed,
			});

			const encoded1 = codec1.encode([], encode);
			const encoded2 = codec2.encode([], encode);

			assert.deepEqual(codec1.decode(encoded1, decode), []);
			assert.deepEqual(codec1.decode(encoded2, decode), []);
			assert.deepEqual(codec2.decode(encoded1, decode), []);
			assert.deepEqual(codec2.decode(encoded2, decode), []);
		});
	});

	describe("TreeCompressionStrategy.CompressedIncremental", () => {
		it("succeeds for oldestSupportedClient FluidClientVersion.v2_74", () => {
			const codec = fieldBatchCodecBuilder.build({
				jsonValidator: ajvValidator,
				oldestSupportedClient: FluidClientVersion.v2_74,
			});

			const input = cursorForJsonableTreeField([simpleTestData]);
			const { encode: encode0 } = makeTestFieldBatchContexts({
				encodeType: TreeCompressionStrategy.CompressedIncremental,
			});

			assert.doesNotThrow(() => codec.encode([input], encode0));
		});

		it("fails for unsupported oldestSupportedClient", () => {
			const codec = fieldBatchCodecBuilder.build({
				jsonValidator: ajvValidator,
				oldestSupportedClient: FluidClientVersion.v2_0,
			});

			const input = cursorForJsonableTreeField([simpleTestData]);
			const { encode } = makeTestFieldBatchContexts({
				encodeType: TreeCompressionStrategy.CompressedIncremental,
			});

			assert.throws(
				() => codec.encode([input], encode),
				validateAssertionError(/Unsupported FieldBatchFormatVersion/),
			);
		});
	});

	describe("round-trip encoding", () => {
		it("v1 codec encodes and decodes correctly", () => {
			const codec = fieldBatchCodecBuilder.build({
				jsonValidator: ajvValidator,
				oldestSupportedClient: FluidClientVersion.v2_0,
			});

			const input = cursorForJsonableTreeField([simpleTestData]);
			const { encode, decode } = makeTestFieldBatchContexts({
				encodeType: TreeCompressionStrategy.Uncompressed,
			});

			const encoded = codec.encode([input], encode);
			const decoded = codec.decode(encoded, decode);
			const decodedJson = decoded.map(jsonableTreeFromFieldCursor);
			assert.deepEqual([[simpleTestData]], decodedJson);
		});

		it("v2 codec encodes and decodes correctly", () => {
			const codec = fieldBatchCodecBuilder.build({
				jsonValidator: ajvValidator,
				oldestSupportedClient: FluidClientVersion.v2_74,
			});

			const input = cursorForJsonableTreeField([simpleTestData]);
			const { encode, decode } = makeTestFieldBatchContexts({
				encodeType: TreeCompressionStrategy.Uncompressed,
			});

			const encoded = codec.encode([input], encode);
			const decoded = codec.decode(encoded, decode);
			const decodedJson = decoded.map(jsonableTreeFromFieldCursor);
			assert.deepEqual([[simpleTestData]], decodedJson);
		});
	});

	describe("vTextExperimental decoding", () => {
		// The format has no oldestSupportedClient, so only an override selects it.
		const vTextCodec = fieldBatchCodecBuilder.build({
			jsonValidator: ajvValidator,
			oldestSupportedClient: currentVersion,
			writeVersionOverrides: new Map([
				[fieldBatchCodecBuilder.name, FieldBatchFormatVersion.vTextExperimental],
			]),
			allowPossiblyIncompatibleWriteVersionOverrides: true,
		});
		const { decode } = makeTestFieldBatchContexts({
			encodeType: TreeCompressionStrategy.Compressed,
		});

		// The batches below are written by hand. Each one uses specialized (`f`) shapes.
		// The default specialization strategy never writes these shapes, so these cases are the only coverage
		// of their decoding through the codec, which validates them against the format schema and dispatches by version.
		// Encoding through the codec is covered for every format by the test trees in schemaBasedEncode.spec.ts.
		const cases: {
			readonly name: string;
			readonly batch: EncodedFieldBatchVTextExperimental;
			/** The content of the one field in `batch`. */
			readonly expected: JsonableTree[];
		}[] = [
			{
				name: "a field override",
				batch: {
					version: FieldBatchFormatVersion.vTextExperimental,
					identifiers: [],
					shapes: [
						// 0: a node with a variable boolean field "bold".
						{ c: { type: "Format", value: false, fields: [["bold", 1]] } },
						// 1: a variable boolean.
						{ c: { type: "boolean", value: true } },
						// 2: the constant boolean false.
						{ c: { type: "boolean", value: [false] } },
						// 3: shape 0 with "bold" kept as the constant false.
						{ f: { base: 0, fields: [["bold", 2]] } },
					],
					// The node uses shape 3, so "bold" writes no data.
					data: [[3]],
				},
				expected: [
					{
						type: brand("Format"),
						fields: { bold: [{ type: brand("boolean"), value: false }] },
					},
				],
			},
			{
				name: "a value override",
				batch: {
					version: FieldBatchFormatVersion.vTextExperimental,
					identifiers: [],
					shapes: [
						// 0: a string leaf with a variable value.
						{ c: { type: "string", value: true } },
						// 1: shape 0 with the constant value "pinned".
						{ f: { base: 0, value: ["pinned"] } },
					],
					data: [[1]],
				},
				expected: [{ type: brand("string"), value: "pinned" }],
			},
			{
				name: "a specialized shape of a specialized shape",
				batch: {
					version: FieldBatchFormatVersion.vTextExperimental,
					identifiers: [],
					shapes: [
						// 0: a node with the variable boolean fields "bold" and "italic".
						{
							c: {
								type: "Format",
								value: false,
								fields: [
									["bold", 1],
									["italic", 1],
								],
							},
						},
						// 1: a variable boolean.
						{ c: { type: "boolean", value: true } },
						// 2: the constant boolean true.
						{ c: { type: "boolean", value: [true] } },
						// 3: shape 0 with "bold" kept as true.
						{ f: { base: 0, fields: [["bold", 2]] } },
						// 4: shape 3 with "italic" also kept as true.
						{ f: { base: 3, fields: [["italic", 2]] } },
					],
					data: [[4]],
				},
				expected: [
					{
						type: brand("Format"),
						fields: {
							bold: [{ type: brand("boolean"), value: true }],
							italic: [{ type: brand("boolean"), value: true }],
						},
					},
				],
			},
			{
				name: "specialized shapes in a field that can contain more than one shape",
				batch: {
					version: FieldBatchFormatVersion.vTextExperimental,
					identifiers: [],
					shapes: [
						// 0: a node with a sequence field "items".
						{ c: { type: "Doc", value: false, fields: [["items", 1]] } },
						// 1: a sequence of items, where each item writes its own shape.
						{ a: 2 },
						// 2: any shape.
						{ d: 0 },
						// 3: an item with a variable boolean field "bold".
						{ c: { type: "Item", value: false, fields: [["bold", 4]] } },
						// 4: a variable boolean.
						{ c: { type: "boolean", value: true } },
						// 5: the constant boolean false.
						{ c: { type: "boolean", value: [false] } },
						// 6: shape 3 with "bold" kept as false.
						{ f: { base: 3, fields: [["bold", 5]] } },
					],
					// The first item uses shape 6 and writes no data.
					// The second item uses shape 3 and writes its value of "bold".
					data: [[0, [6, 3, true]]],
				},
				expected: [
					{
						type: brand("Doc"),
						fields: {
							items: [
								{
									type: brand("Item"),
									fields: { bold: [{ type: brand("boolean"), value: false }] },
								},
								{
									type: brand("Item"),
									fields: { bold: [{ type: brand("boolean"), value: true }] },
								},
							],
						},
					},
				],
			},
		];

		for (const { name, batch, expected } of cases) {
			it(`decodes ${name}`, () => {
				const decoded = vTextCodec.decode(batch as JsonCompatibleReadOnly, decode);
				assert.deepEqual(decoded.map(jsonableTreeFromFieldCursor), [expected]);
			});
		}
	});
});
