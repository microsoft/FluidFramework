/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "node:assert";
import { SandboxedIdCompressor } from "../sandboxedIdCompressor.js";
import type { OpSpaceCompressedId, SessionId, SessionSpaceCompressedId, StableId } from "../types/index.js";

describe("SandboxedIdCompressor", () => {
	describe("generateCompressedId", () => {
		it("generates a single ID successfully", () => {
			const compressor = new SandboxedIdCompressor(1, 100);
			const id = compressor.generateCompressedId();
			assert.equal(typeof id, "number");
			assert(id < 0, "Generated ID should be negative (session-space)");
		});

		it("generates sequential IDs", () => {
			const compressor = new SandboxedIdCompressor(1, 100);
			const id1 = compressor.generateCompressedId();
			const id2 = compressor.generateCompressedId();
			const id3 = compressor.generateCompressedId();

			// IDs should be sequential and negative
			assert.equal(id1, -1 as SessionSpaceCompressedId);
			assert.equal(id2, -2 as SessionSpaceCompressedId);
			assert.equal(id3, -3 as SessionSpaceCompressedId);
		});

		it("generates IDs within the burned range", () => {
			const baseId = 10;
			const burnCount = 5;
			const compressor = new SandboxedIdCompressor(baseId, burnCount);

			const ids: SessionSpaceCompressedId[] = [];
			for (let i = 0; i < burnCount; i++) {
				ids.push(compressor.generateCompressedId());
			}

			// All IDs should be within the expected range
			assert.equal(ids.length, burnCount);
			assert.equal(ids[0], -10 as SessionSpaceCompressedId);
			assert.equal(ids[1], -11 as SessionSpaceCompressedId);
			assert.equal(ids[2], -12 as SessionSpaceCompressedId);
			assert.equal(ids[3], -13 as SessionSpaceCompressedId);
			assert.equal(ids[4], -14 as SessionSpaceCompressedId);
		});

		it("throws when all IDs are exhausted", () => {
			const compressor = new SandboxedIdCompressor(1, 3);

			// Generate all available IDs
			compressor.generateCompressedId(); // -1
			compressor.generateCompressedId(); // -2
			compressor.generateCompressedId(); // -3

			// Next call should throw
			assert.throws(
				() => compressor.generateCompressedId(),
				(error: Error) => {
					assert(error.message.includes("exhausted all burned IDs"));
					assert(error.message.includes("Generated 3"));
					assert(error.message.includes("only 3 were allocated"));
					return true;
				},
			);
		});

		it("throws immediately when burnCount is 0", () => {
			const compressor = new SandboxedIdCompressor(1, 0);

			assert.throws(
				() => compressor.generateCompressedId(),
				(error: Error) => {
					assert(error.message.includes("exhausted all burned IDs"));
					return true;
				},
			);
		});

		it("handles large burn counts", () => {
			const burnCount = 10000;
			const compressor = new SandboxedIdCompressor(1, burnCount);

			// Generate many IDs
			for (let i = 0; i < burnCount; i++) {
				const id = compressor.generateCompressedId();
				assert.equal(id, -(i + 1) as SessionSpaceCompressedId);
			}

			// Next should throw
			assert.throws(() => compressor.generateCompressedId());
		});

		it("uses correct formula for negative IDs", () => {
			// genCount = -localId, so localId = -genCount
			const baseId = 5;
			const compressor = new SandboxedIdCompressor(baseId, 3);

			// First ID: genCount = 5, localId = -5
			const id1 = compressor.generateCompressedId();
			assert.equal(id1, -5 as SessionSpaceCompressedId);

			// Second ID: genCount = 6, localId = -6
			const id2 = compressor.generateCompressedId();
			assert.equal(id2, -6 as SessionSpaceCompressedId);
		});
	});

	describe("unsupported operations", () => {
		let compressor: SandboxedIdCompressor;

		beforeEach(() => {
			compressor = new SandboxedIdCompressor(1, 100);
		});

		it("throws on localSessionId access", () => {
			assert.throws(
				() => compressor.localSessionId,
				(error: Error) => {
					assert(error.message.includes("does not support localSessionId"));
					assert(error.message.includes("limited compressor for sandbox use only"));
					return true;
				},
			);
		});

		it("throws on generateDocumentUniqueId", () => {
			assert.throws(
				() => compressor.generateDocumentUniqueId(),
				(error: Error) => {
					assert(error.message.includes("does not support generateDocumentUniqueId"));
					assert(error.message.includes("Use generateCompressedId instead"));
					return true;
				},
			);
		});

		it("throws on normalizeToOpSpace", () => {
			const id = -1 as SessionSpaceCompressedId;
			assert.throws(
				() => compressor.normalizeToOpSpace(id),
				(error: Error) => {
					assert(error.message.includes("does not support normalizeToOpSpace"));
					assert(error.message.includes("limited compressor for sandbox use only"));
					return true;
				},
			);
		});

		it("throws on normalizeToSessionSpace", () => {
			assert.throws(
				() => compressor.normalizeToSessionSpace(1 as OpSpaceCompressedId, "test-session" as SessionId),
				(error: Error) => {
					assert(error.message.includes("does not support normalizeToSessionSpace"));
					assert(error.message.includes("limited compressor for sandbox use only"));
					return true;
				},
			);
		});

		it("throws on decompress", () => {
			const id = -1 as SessionSpaceCompressedId;
			assert.throws(
				() => compressor.decompress(id),
				(error: Error) => {
					assert(error.message.includes("does not support decompress"));
					assert(error.message.includes("limited compressor for sandbox use only"));
					return true;
				},
			);
		});

		it("throws on recompress", () => {
			const stableId = "00000000-0000-4000-8000-000000000000" as StableId;			assert.throws(
				() => compressor.recompress(stableId),
				(error: Error) => {
					assert(error.message.includes("does not support recompress"));
					assert(error.message.includes("limited compressor for sandbox use only"));
					return true;
				},
			);
		});

		it("throws on tryRecompress", () => {
			const stableId = "00000000-0000-4000-8000-000000000000" as StableId;
			assert.throws(
				() => compressor.tryRecompress(stableId),
				(error: Error) => {
					assert(error.message.includes("does not support tryRecompress"));
					assert(error.message.includes("limited compressor for sandbox use only"));
					return true;
				},
			);
		});
	});

	describe("sandbox scenarios", () => {
		it("can be used to pre-allocate IDs for sandboxed environments", () => {
			// Simulate a main compressor burning IDs
			const baseId = 1000;
			const burnCount = 500;

			// Create a sandboxed compressor with the burned range
			const sandboxCompressor = new SandboxedIdCompressor(baseId, burnCount);

			// Sandbox can generate IDs independently
			const sandboxIds: SessionSpaceCompressedId[] = [];
			for (let i = 0; i < 10; i++) {
				sandboxIds.push(sandboxCompressor.generateCompressedId());
			}

			// Verify IDs are in expected range
			assert.equal(sandboxIds[0], -1000 as SessionSpaceCompressedId);
			assert.equal(sandboxIds[9], -1009 as SessionSpaceCompressedId);
		});

		it("multiple sandboxed compressors can work with different ranges", () => {
			// Create two sandboxed compressors with different ranges
			const sandbox1 = new SandboxedIdCompressor(1, 100);
			const sandbox2 = new SandboxedIdCompressor(101, 100);

			const id1 = sandbox1.generateCompressedId();
			const id2 = sandbox2.generateCompressedId();

			// IDs from different ranges should not collide
			assert.equal(id1, -1 as SessionSpaceCompressedId);
			assert.equal(id2, -101 as SessionSpaceCompressedId);
			assert.notEqual(id1, id2);
		});

		it("exhausting one sandboxed compressor doesn't affect another", () => {
			const sandbox1 = new SandboxedIdCompressor(1, 2);
			const sandbox2 = new SandboxedIdCompressor(10, 2);

			// Exhaust sandbox1
			sandbox1.generateCompressedId();
			sandbox1.generateCompressedId();
			assert.throws(() => sandbox1.generateCompressedId());

			// sandbox2 should still work
			const id = sandbox2.generateCompressedId();
			assert.equal(id, -10 as SessionSpaceCompressedId);
		});
	});

	describe("edge cases", () => {
		it("handles baseId at boundary values", () => {
			const compressor = new SandboxedIdCompressor(Number.MAX_SAFE_INTEGER - 10, 5);
			const id = compressor.generateCompressedId();
			assert(id < 0);
		});

		it("handles single ID allocation", () => {
			const compressor = new SandboxedIdCompressor(42, 1);
			const id = compressor.generateCompressedId();
			assert.equal(id, -42 as SessionSpaceCompressedId);
			assert.throws(() => compressor.generateCompressedId());
		});
	});
});
