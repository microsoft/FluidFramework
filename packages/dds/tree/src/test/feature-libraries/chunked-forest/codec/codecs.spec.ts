/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "node:assert";
import { validateAssertionError } from "@fluidframework/test-runtime-utils/internal";
import {
	makeFieldBatchCodec,
	// eslint-disable-next-line import-x/no-internal-modules
} from "../../../../feature-libraries/chunked-forest/codec/codecs.js";
import {
	FieldBatchFormatVersion,
	// eslint-disable-next-line import-x/no-internal-modules
} from "../../../../feature-libraries/chunked-forest/codec/index.js";
import {
	TreeCompressionStrategy,
	TreeCompressionStrategyExtended,
	cursorForJsonableTreeField,
	jsonableTreeFromFieldCursor,
} from "../../../../feature-libraries/index.js";
import { FluidClientVersion } from "../../../../codec/index.js";
import { ajvValidator } from "../../../codec/index.js";
import { testIdCompressor } from "../../../utils.js";
import { testTrees } from "../../../cursorTestSuite.js";

describe("makeFieldBatchCodec", () => {
	// Use the first simple test tree from the test suite
	const [, simpleTestData] = testTrees[0];

	describe("version mapping", () => {
		it("uses v1 format for FluidClientVersion.v2_0", () => {
			const codec = makeFieldBatchCodec({
				jsonValidator: ajvValidator,
				minVersionForCollab: FluidClientVersion.v2_0,
			});

			const input = cursorForJsonableTreeField([simpleTestData]);
			const context = {
				encodeType: TreeCompressionStrategy.Uncompressed,
				originatorId: testIdCompressor.localSessionId,
				idCompressor: testIdCompressor,
			};

			const encoded = codec.encode([input], context);
			assert.equal(encoded.version, FieldBatchFormatVersion.v1);
		});

		it("uses v2 format for FluidClientVersion.v2_73", () => {
			const codec = makeFieldBatchCodec({
				jsonValidator: ajvValidator,
				minVersionForCollab: FluidClientVersion.v2_73,
			});

			const input = cursorForJsonableTreeField([simpleTestData]);
			const context = {
				encodeType: TreeCompressionStrategy.Uncompressed,
				originatorId: testIdCompressor.localSessionId,
				idCompressor: testIdCompressor,
			};

			const encoded = codec.encode([input], context);
			assert.equal(encoded.version, FieldBatchFormatVersion.v2);
		});
	});

	describe("TreeCompressionStrategyExtended.CompressedIncremental", () => {
		it("succeeds for minVersionForCollab FluidClientVersion.v2_73", () => {
			const codec = makeFieldBatchCodec({
				jsonValidator: ajvValidator,
				minVersionForCollab: FluidClientVersion.v2_73,
			});

			const input = cursorForJsonableTreeField([simpleTestData]);
			const context = {
				encodeType: TreeCompressionStrategyExtended.CompressedIncremental,
				originatorId: testIdCompressor.localSessionId,
				idCompressor: testIdCompressor,
			};

			assert.doesNotThrow(() => codec.encode([input], context));
		});

		it("fails for unsupported minVersionForCollab", () => {
			const codec = makeFieldBatchCodec({
				jsonValidator: ajvValidator,
				minVersionForCollab: FluidClientVersion.v2_0,
			});

			const input = cursorForJsonableTreeField([simpleTestData]);
			const context = {
				encodeType: TreeCompressionStrategyExtended.CompressedIncremental,
				originatorId: testIdCompressor.localSessionId,
				idCompressor: testIdCompressor,
			};

			assert.throws(
				() => codec.encode([input], context),
				(error: Error) => validateAssertionError(error, /Unsupported FieldBatchFormatVersion/),
			);
		});
	});

	describe("round-trip encoding", () => {
		it("v1 codec encodes and decodes correctly", () => {
			const codec = makeFieldBatchCodec({
				jsonValidator: ajvValidator,
				minVersionForCollab: FluidClientVersion.v2_0,
			});

			const input = cursorForJsonableTreeField([simpleTestData]);
			const context = {
				encodeType: TreeCompressionStrategy.Uncompressed,
				originatorId: testIdCompressor.localSessionId,
				idCompressor: testIdCompressor,
			};

			const encoded = codec.encode([input], context);
			const decoded = codec.decode(encoded, context);
			const decodedJson = decoded.map(jsonableTreeFromFieldCursor);
			assert.deepEqual([[simpleTestData]], decodedJson);
		});

		it("v2 codec encodes and decodes correctly", () => {
			const codec = makeFieldBatchCodec({
				jsonValidator: ajvValidator,
				minVersionForCollab: FluidClientVersion.v2_73,
			});

			const input = cursorForJsonableTreeField([simpleTestData]);
			const context = {
				encodeType: TreeCompressionStrategy.Uncompressed,
				originatorId: testIdCompressor.localSessionId,
				idCompressor: testIdCompressor,
			};

			const encoded = codec.encode([input], context);
			const decoded = codec.decode(encoded, context);
			const decodedJson = decoded.map(jsonableTreeFromFieldCursor);
			assert.deepEqual([[simpleTestData]], decodedJson);
		});
	});
});
