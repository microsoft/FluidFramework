/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "node:assert";

import {
	validateAssertionError,
	validateUsageError,
} from "@fluidframework/test-runtime-utils/internal";

import {
	currentVersion,
	FluidClientVersion,
	type CodecWriteOptions,
} from "../../../codec/index.js";
import { rootFieldKey } from "../../../core/index.js";
import { FormatValidatorBasic } from "../../../external-utilities/index.js";
import {
	chunkField,
	defaultChunkPolicy,
	// eslint-disable-next-line import-x/no-internal-modules
} from "../../../feature-libraries/chunked-forest/chunkTree.js";
// eslint-disable-next-line import-x/no-internal-modules
import type { TreeChunk } from "../../../feature-libraries/chunked-forest/index.js";
import {
	type FieldSet,
	forestCodecBuilder,
	// eslint-disable-next-line import-x/no-internal-modules
} from "../../../feature-libraries/forest-summary/codec.js";
// eslint-disable-next-line import-x/no-internal-modules
import { ForestFormatVersion } from "../../../feature-libraries/forest-summary/formatCommon.js";
// eslint-disable-next-line import-x/no-internal-modules
import type { FormatV1 } from "../../../feature-libraries/forest-summary/formatV1.js";
// eslint-disable-next-line import-x/no-internal-modules
import type { FormatV2 } from "../../../feature-libraries/forest-summary/formatV2.js";
import {
	FieldBatchFormatVersion,
	TreeCompressionStrategy,
	cursorForJsonableTreeField,
	fieldBatchCodecBuilder,
} from "../../../feature-libraries/index.js";
import { brand } from "../../../util/index.js";
import { EmptyObject } from "../../cursorTestSuite.js";
import { testIdCompressor } from "../../utils.js";

const codecOptionsOld: CodecWriteOptions = {
	jsonValidator: FormatValidatorBasic,
	minVersionForCollab: FluidClientVersion.v2_0,
};

const codecOptionsCurrent: CodecWriteOptions = {
	jsonValidator: FormatValidatorBasic,
	minVersionForCollab: currentVersion,
};

const fieldBatchCodecOld = fieldBatchCodecBuilder.build(codecOptionsOld);
const fieldBatchCodecCurrent = fieldBatchCodecBuilder.build(codecOptionsCurrent);
const context = {
	encodeType: TreeCompressionStrategy.Uncompressed,
	originatorId: testIdCompressor.localSessionId,
	idCompressor: testIdCompressor,
};

const codecOld = forestCodecBuilder.build({
	...codecOptionsOld,
	fieldBatchCodec: fieldBatchCodecOld,
});
const codecCurrent = forestCodecBuilder.build({
	...codecOptionsCurrent,
	fieldBatchCodec: fieldBatchCodecCurrent,
});

const testFieldChunks: TreeChunk[] = chunkField(
	cursorForJsonableTreeField([{ type: brand(EmptyObject.identifier) }]),
	{ policy: defaultChunkPolicy, idCompressor: testIdCompressor },
);
assert(testFieldChunks.length === 1);
const testFieldChunk: TreeChunk = testFieldChunks[0];

const malformedData: [string, unknown][] = [
	[
		"additional piece of data in entry",
		new Map([[rootFieldKey, [testFieldChunk.cursor(), "additional data"]]]),
	],
	["incorrect data type", ["incorrect data type"]],
];

/**
 * [
 * name,
 * data to encode,
 * data to decode,
 * which coded version is expected to encode to this exact data (if any)
 * ][]
 */
const validData: [
	string,
	FieldSet,
	FormatV1 | FormatV2 | undefined,
	ForestFormatVersion | undefined,
][] = [
	[
		"no entry v1",
		new Map(),
		{
			version: ForestFormatVersion.v1,
			keys: [],
			fields: fieldBatchCodecOld.encode([], context),
		},
		ForestFormatVersion.v1,
	],
	[
		"single entry v1",
		new Map([[rootFieldKey, testFieldChunk.cursor()]]),
		{
			version: ForestFormatVersion.v1,
			keys: [rootFieldKey],
			fields: fieldBatchCodecOld.encode([testFieldChunk.cursor()], context),
		},
		ForestFormatVersion.v1,
	],
	[
		"new field batch in v1",
		new Map([[rootFieldKey, testFieldChunk.cursor()]]),
		{
			version: ForestFormatVersion.v1,
			keys: [rootFieldKey],
			fields: fieldBatchCodecCurrent.encode([testFieldChunk.cursor()], context),
		},
		undefined,
	],
	[
		"multiple entries v1",
		new Map([
			[rootFieldKey, testFieldChunk.cursor()],
			[brand("X"), testFieldChunk.cursor()],
		]),
		undefined,
		ForestFormatVersion.v1,
	],
	[
		"no entry v2",
		new Map(),
		{
			version: ForestFormatVersion.v2,
			keys: [],
			fields: fieldBatchCodecCurrent.encode([], context),
		},
		ForestFormatVersion.v2,
	],
	[
		"single entry v2",
		new Map([[rootFieldKey, testFieldChunk.cursor()]]),
		{
			version: ForestFormatVersion.v2,
			keys: [rootFieldKey],
			fields: fieldBatchCodecCurrent.encode([testFieldChunk.cursor()], context),
		},
		ForestFormatVersion.v2,
	],
	[
		"old field batch in v2",
		new Map([[rootFieldKey, testFieldChunk.cursor()]]),
		{
			version: ForestFormatVersion.v2,
			keys: [rootFieldKey],
			fields: fieldBatchCodecOld.encode([testFieldChunk.cursor()], context),
		},
		undefined,
	],
	[
		"multiple entries v2",
		new Map([
			[rootFieldKey, testFieldChunk.cursor()],
			[brand("X"), testFieldChunk.cursor()],
		]),
		undefined,
		ForestFormatVersion.v2,
	],
];

describe("ForestSummarizerCodec", () => {
	describe("encodes and decodes valid data.", () => {
		for (const [codec, codecVersion] of [
			[codecOld, ForestFormatVersion.v1],
			[codecCurrent, ForestFormatVersion.v2],
		] as const) {
			for (const [name, data, expected, encoderVersion] of validData) {
				it(`${name} with codec version ${codecVersion}`, () => {
					const encodedData = codec.encode(data, context);
					if (expected !== undefined) {
						if (encoderVersion === codecVersion) {
							assert.deepEqual(encodedData, expected);
						} else {
							// Should be able to decode the expected data with either codec,
							// since codec should be able to decode all formats, not just the one it encodes.
							const decodedData2 = codec.decode(expected, context);
							assert.deepEqual(decodedData2, data);
						}
					}

					const decodedData = codec.decode(encodedData, context);
					assert.deepEqual(decodedData, data);
				});
			}
		}
	});

	describe("throws on receiving malformed data during encode.", () => {
		for (const [name, data] of malformedData) {
			it(name, () => {
				assert.throws(() => codecCurrent.encode(data as FieldSet, context), "malformed data");
			});
		}
	});

	describe("throws on receiving malformed data during decode.", () => {
		it("invalid version", () => {
			assert.throws(
				() =>
					codecCurrent.decode(
						{
							version: 2.5,
							fields: fieldBatchCodecOld.encode([], context),
							keys: [],
						},
						context,
					),
				validateUsageError(
					/Unsupported version 2\.5 encountered while decoding Forest data. Supported versions for this data are: 1, 2\./,
				),
			);
		});

		it("invalid nested version", () => {
			// Create a properly encoded forest, then modify the nested version to be invalid
			const encoded = fieldBatchCodecOld.encode([], context);
			assert(typeof encoded === "object" && encoded !== null);
			const invalidFields = { ...encoded, version: 2.5 };

			assert.throws(
				() =>
					codecCurrent.decode(
						{
							version: 1,
							keys: [],
							fields: invalidFields,
						},
						context,
					),
				validateUsageError(
					/Unsupported version 2\.5 encountered while decoding FieldBatch data/,
				),
			);
		});

		it("missing fields", () => {
			assert.throws(
				() =>
					codecCurrent.decode(
						{
							version: brand<ForestFormatVersion>(ForestFormatVersion.v1),
							keys: [],
						} as unknown as FormatV1,
						context,
					),
				validateAssertionError("Data being decoded should validate"),
			);
		});

		it("extra field", () => {
			assert.throws(
				() =>
					codecCurrent.decode(
						{
							version: brand<ForestFormatVersion>(ForestFormatVersion.v1),
							fields: { version: brand<FieldBatchFormatVersion>(FieldBatchFormatVersion.v1) },
							keys: [],
							wrong: 5,
						} as unknown as FormatV1,
						context,
					),
				validateAssertionError("Data being decoded should validate"),
			);
		});
	});
});
