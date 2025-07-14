/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "node:assert";

import type { TreeChunk } from "../../../../core/index.js";
import {
	ForestEncodedDataBuilder,
	type EncodedDataBuilder,
	// eslint-disable-next-line import/no-internal-modules
} from "../../../../feature-libraries/chunked-forest/codec/encodedDataBuilder.js";
import type {
	ChunkReferenceId,
	IncrementalEncoder,
	// eslint-disable-next-line import/no-internal-modules
} from "../../../../feature-libraries/chunked-forest/codec/codecs.js";
import type {
	BufferFormat,
	// eslint-disable-next-line import/no-internal-modules
} from "../../../../feature-libraries/chunked-forest/codec/compressedEncode.js";
import type {
	EncodedFieldBatch,
	// eslint-disable-next-line import/no-internal-modules
} from "../../../../feature-libraries/chunked-forest/codec/format.js";

/**
 * Mock IncrementalEncoder for testing purposes.
 */
class MockIncrementalEncoder implements IncrementalEncoder {
	private nextId = 0;
	public readonly encodedChunks = new Map<ChunkReferenceId, EncodedFieldBatch>();

	public encodeIncrementalChunk(
		chunk: TreeChunk,
		chunkEncoder: () => EncodedFieldBatch,
	): ChunkReferenceId {
		const id = this.nextId++;
		const encodedBatch = chunkEncoder();
		this.encodedChunks.set(id, encodedBatch);
		return id;
	}
}

describe("EncodedDataBuilder", () => {
	let mockBuffer: BufferFormat;
	let mockIncrementalEncoder: MockIncrementalEncoder;
	let testChunk: TreeChunk;

	beforeEach(() => {
		mockBuffer = [];
		mockIncrementalEncoder = new MockIncrementalEncoder();
		testChunk = {} as unknown as TreeChunk; // Mock chunk for testing
	});

	describe("ForestEncodedDataBuilder", () => {
		describe("EncodedDataBuilder interface compliance", () => {
			it("implements all required methods", () => {
				const builder: EncodedDataBuilder = new ForestEncodedDataBuilder(
					mockBuffer,
					mockIncrementalEncoder,
				);

				// Test that all interface methods are available
				assert.equal(typeof builder.shouldEncodeIncrementally, "boolean");
				assert.equal(typeof builder.addToBuffer, "function");
				assert.equal(typeof builder.encodeIncrementalChunk, "function");
				assert.equal(typeof builder.createFromBuffer, "function");
			});
		});

		describe("shouldEncodeIncrementally", () => {
			it("returns true when incremental encoder is provided", () => {
				const builder = new ForestEncodedDataBuilder(mockBuffer, mockIncrementalEncoder);
				assert.equal(
					builder.shouldEncodeIncrementally,
					true,
					"shouldEncodeIncrementally should be true",
				);
			});

			it("returns false when incremental encoder is not provided", () => {
				const builder = new ForestEncodedDataBuilder(mockBuffer, undefined);
				assert.equal(
					builder.shouldEncodeIncrementally,
					false,
					"shouldEncodeIncrementally should be false",
				);
			});
		});

		describe("addToBuffer", () => {
			it("adds data to buffer", () => {
				const builder = new ForestEncodedDataBuilder(mockBuffer, mockIncrementalEncoder);
				const testData = "test data";

				builder.addToBuffer(testData);

				assert.equal(mockBuffer.length, 1, "Buffer should contain one item");
				assert.equal(mockBuffer[0], testData, "Buffer contents is incorrect");
			});

			it("adds multiple data items to buffer", () => {
				const builder = new ForestEncodedDataBuilder(mockBuffer, mockIncrementalEncoder);
				const testData1 = "test data 1";
				const testData2 = "test data 2";

				builder.addToBuffer(testData1);
				builder.addToBuffer(testData2);

				assert.equal(mockBuffer.length, 2, "Buffer should contain two items");
				assert.equal(mockBuffer[0], testData1, "Buffer first item is incorrect");
				assert.equal(mockBuffer[1], testData2, "Buffer second item is incorrect");
			});

			it("works without incremental encoder", () => {
				const builder = new ForestEncodedDataBuilder(
					mockBuffer,
					undefined /* incrementalEncoder */,
				);
				const testData = "test data";

				builder.addToBuffer(testData);

				assert.equal(mockBuffer.length, 1, "Buffer should contain one item");
				assert.equal(mockBuffer[0], testData, "Buffer contents is incorrect");
			});
		});

		describe("encodeIncrementalChunk", () => {
			it("encodes chunk with incremental encoder", () => {
				const builder = new ForestEncodedDataBuilder(mockBuffer, mockIncrementalEncoder);
				const referenceId = builder.encodeIncrementalChunk(testChunk, (chunkDataBuilder) => {
					chunkDataBuilder.addToBuffer("chunk data");
				});
				builder.addToBuffer(referenceId);
				assert.equal(mockBuffer.length, 1, "Main buffer should contain one item");
				assert.equal(mockBuffer[0], referenceId, "Main buffer contents is incorrect");
			});

			it("supports nested incremental chunk encoding", () => {
				const builder = new ForestEncodedDataBuilder(mockBuffer, mockIncrementalEncoder);
				const referenceId = builder.encodeIncrementalChunk(testChunk, (chunkDataBuilder) => {
					const nestedReferenceId = chunkDataBuilder.encodeIncrementalChunk(
						{} as unknown as TreeChunk,
						(nestedBuilder) => {
							nestedBuilder.addToBuffer("nested data");
						},
					);
					chunkDataBuilder.addToBuffer(nestedReferenceId);
				});
				builder.addToBuffer(referenceId);

				// Verify that the main buffer is not affected by nested builder operations and only
				// has one item (the reference ID).
				assert.equal(mockBuffer.length, 1, "Main buffer should contain one item");
				assert.equal(mockBuffer[0], referenceId, "Main buffer contents is incorrect");
			});

			it("throws when incremental encoder is not provided", () => {
				const builder = new ForestEncodedDataBuilder(
					mockBuffer,
					undefined /* incrementalEncoder */,
				);
				assert.throws(() => {
					builder.encodeIncrementalChunk(testChunk, (chunkDataBuilder) => {
						chunkDataBuilder.addToBuffer("chunk data");
					});
				}, /incremental encoding must be enabled/);
			});
		});

		describe("createFromBuffer", () => {
			it("creates new builder with provided buffer", () => {
				const originalBuilder = new ForestEncodedDataBuilder(
					mockBuffer,
					mockIncrementalEncoder,
				);

				const newBuffer: BufferFormat = [];
				const newBuilder = originalBuilder.createFromBuffer(newBuffer);
				assert(newBuilder instanceof ForestEncodedDataBuilder);
				assert.equal(newBuilder.shouldEncodeIncrementally, true);

				// Verify that the new builder uses the new buffer
				newBuilder.addToBuffer("test data");
				assert.equal(newBuffer.length, 1, "New buffer should contain one item");
				assert.equal(newBuffer[0], "test data", "New buffer contents is incorrect");

				// Verify that the original buffer is unchanged
				assert.equal(mockBuffer.length, 0, "Original buffer should be empty");
			});

			it("creates new builder without incremental encoder", () => {
				const originalBuilder = new ForestEncodedDataBuilder(
					mockBuffer,
					undefined /* incrementalEncoder */,
				);

				const newBuffer: BufferFormat = [];
				const newBuilder = originalBuilder.createFromBuffer(newBuffer);
				assert(newBuilder instanceof ForestEncodedDataBuilder);
				assert.equal(newBuilder.shouldEncodeIncrementally, false);

				newBuilder.addToBuffer("test data");
				assert.equal(newBuffer.length, 1, "New buffer should contain one item");
				assert.equal(newBuffer[0], "test data", "New buffer contents is incorrect");
			});
		});
	});
});
