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
	makeForestSummarizerCodec,
	// eslint-disable-next-line import-x/no-internal-modules
} from "../../../feature-libraries/forest-summary/codec.js";
// eslint-disable-next-line import-x/no-internal-modules
import { ForestFormatVersion } from "../../../feature-libraries/forest-summary/formatCommon.js";
// eslint-disable-next-line import-x/no-internal-modules
import type { FormatV1 } from "../../../feature-libraries/forest-summary/formatV1.js";
import {
	FieldBatchFormatVersion,
	TreeCompressionStrategy,
	cursorForJsonableTreeField,
	makeFieldBatchCodec,
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

const fieldBatchCodecOld = makeFieldBatchCodec(codecOptionsOld);
const fieldBatchCodecCurrent = makeFieldBatchCodec(codecOptionsCurrent);
const context = {
	encodeType: TreeCompressionStrategy.Uncompressed,
	originatorId: testIdCompressor.localSessionId,
	idCompressor: testIdCompressor,
};

const codecOld = makeForestSummarizerCodec(codecOptionsOld, fieldBatchCodecOld);
const codecCurrent = makeForestSummarizerCodec(codecOptionsCurrent, fieldBatchCodecCurrent);

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
const validDataOld: [string, FieldSet, FormatV1 | undefined][] = [
	[
		"no entry",
		new Map(),
		{
			version: brand(ForestFormatVersion.v1),
			keys: [],
			fields: fieldBatchCodecOld.encode([], context),
		},
	],
	[
		"single entry",
		new Map([[rootFieldKey, testFieldChunk.cursor()]]),
		{
			version: brand(ForestFormatVersion.v1),
			keys: [rootFieldKey],
			fields: fieldBatchCodecOld.encode([testFieldChunk.cursor()], context),
		},
	],
	[
		"multiple entries",
		new Map([
			[rootFieldKey, testFieldChunk.cursor()],
			[brand("X"), testFieldChunk.cursor()],
		]),
		undefined,
	],
];

const validDataCurrent: [string, FieldSet, FormatV1 | undefined][] = [
	[
		"no entry",
		new Map(),
		{
			version: brand(ForestFormatVersion.v2),
			keys: [],
			fields: fieldBatchCodecCurrent.encode([], context),
		},
	],
	[
		"single entry",
		new Map([[rootFieldKey, testFieldChunk.cursor()]]),
		{
			version: brand(ForestFormatVersion.v2),
			keys: [rootFieldKey],
			fields: fieldBatchCodecCurrent.encode([testFieldChunk.cursor()], context),
		},
	],
	[
		"multiple entries",
		new Map([
			[rootFieldKey, testFieldChunk.cursor()],
			[brand("X"), testFieldChunk.cursor()],
		]),
		undefined,
	],
];

describe("ForestSummarizerCodec", () => {
	describe("encodes and decodes valid old data.", () => {
		for (const [name, data, expected] of validDataOld) {
			it(name, () => {
				const encodedData = codecOld.encode(data, context);
				if (expected !== undefined) {
					assert.deepEqual(encodedData, expected);
				}

				const decodedData = codecOld.decode(encodedData, context);
				assert.deepEqual(decodedData, data);
			});
		}
	});

	describe("encodes and decodes valid current data.", () => {
		for (const [name, data, expected] of validDataCurrent) {
			it(name, () => {
				const encodedData = codecCurrent.encode(data, context);
				if (expected !== undefined) {
					assert.deepEqual(encodedData, expected);
				}

				const decodedData = codecCurrent.decode(encodedData, context);
				assert.deepEqual(decodedData, data);
			});
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
							version: 2.5 as ForestFormatVersion,
							fields: {
								version: brand(FieldBatchFormatVersion.v1),
								identifiers: [],
								shapes: [],
								data: [],
							},
							keys: [],
						},
						context,
					),
				validateUsageError(/Unsupported version 2.5 encountered while decoding data/),
			);
		});

		it("invalid nested version", () => {
			assert.throws(
				() =>
					codecCurrent.decode(
						{
							version: brand(ForestFormatVersion.v1),
							fields: {
								version: 2.5 as FieldBatchFormatVersion,
								identifiers: [],
								shapes: [],
								data: [],
							},
							keys: [],
						},
						context,
					),
				validateAssertionError("Encoded schema should validate"),
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
				validateAssertionError("Encoded schema should validate"),
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
				validateAssertionError("Encoded schema should validate"),
			);
		});
	});
});
