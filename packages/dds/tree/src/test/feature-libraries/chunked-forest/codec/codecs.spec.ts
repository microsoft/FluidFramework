/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "node:assert";

import { validateAssertionError } from "@fluidframework/test-runtime-utils/internal";

import { FluidClientVersion } from "../../../../codec/index.js";
import {
	fieldBatchCodecBuilder,
	// eslint-disable-next-line import-x/no-internal-modules
} from "../../../../feature-libraries/chunked-forest/codec/codecs.js";
import {
	FieldBatchFormatVersion,
	// eslint-disable-next-line import-x/no-internal-modules
} from "../../../../feature-libraries/chunked-forest/codec/index.js";
import {
	TreeCompressionStrategy,
	cursorForJsonableTreeField,
	jsonableTreeFromFieldCursor,
} from "../../../../feature-libraries/index.js";
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
				minVersionForCollab: FluidClientVersion.v2_0,
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
				minVersionForCollab: FluidClientVersion.v2_74,
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
				minVersionForCollab: FluidClientVersion.v2_0,
			});
			const codec2 = fieldBatchCodecBuilder.build({
				jsonValidator: ajvValidator,
				minVersionForCollab: FluidClientVersion.v2_74,
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
		it("succeeds for minVersionForCollab FluidClientVersion.v2_74", () => {
			const codec = fieldBatchCodecBuilder.build({
				jsonValidator: ajvValidator,
				minVersionForCollab: FluidClientVersion.v2_74,
			});

			const input = cursorForJsonableTreeField([simpleTestData]);
			const { encode: encode0 } = makeTestFieldBatchContexts({
				encodeType: TreeCompressionStrategy.CompressedIncremental,
			});

			assert.doesNotThrow(() => codec.encode([input], encode0));
		});

		it("fails for unsupported minVersionForCollab", () => {
			const codec = fieldBatchCodecBuilder.build({
				jsonValidator: ajvValidator,
				minVersionForCollab: FluidClientVersion.v2_0,
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
				minVersionForCollab: FluidClientVersion.v2_0,
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
				minVersionForCollab: FluidClientVersion.v2_74,
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
});
