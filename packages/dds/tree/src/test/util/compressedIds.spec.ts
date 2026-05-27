/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "node:assert";

import type {
	OpSpaceCompressedId,
	SessionId,
	SessionSpaceCompressedId,
} from "@fluidframework/id-compressor";
import { createIdCompressor, createSessionId } from "@fluidframework/id-compressor/internal";
import { validateAssertionError } from "@fluidframework/test-runtime-utils/internal";

import {
	type OriginatorlessEncodedId,
	decodeEncodedIdWithOriginator,
	decodeOriginatorlessEncodedId,
	decompressIdentifierIfNeeded,
	forceDecodeEncodedIdWithoutSession,
	tryDecodeEncodedIdWithoutSession,
} from "../../util/index.js";
import { testIdCompressor } from "../utils.js";

/**
 * Mints an op-space id that is unresolvable by `testIdCompressor` — it was generated
 * in a fresh foreign compressor whose session is unknown to `testIdCompressor`, so
 * it is non-final and `tryNormalizeToSessionSpaceWithoutSession` returns `undefined`.
 */
function makeUnresolvableOpSpaceId(): {
	opSpaceId: OpSpaceCompressedId;
	originatorId: SessionId;
} {
	const foreignSession = createSessionId();
	const foreignCompressor = createIdCompressor(foreignSession);
	const sessionSpaceId = foreignCompressor.generateCompressedId();
	const opSpaceId = foreignCompressor.normalizeToOpSpace(sessionSpaceId);
	return { opSpaceId, originatorId: foreignSession };
}

describe("compressedIds", () => {
	describe("decodeOriginatorlessEncodedId", () => {
		it("returns a session-space id for a finalized compressed id", () => {
			const compressedId = testIdCompressor.generateCompressedId();
			const opSpaceId = testIdCompressor.normalizeToOpSpace(compressedId);
			// `testIdCompressor` finalizes eagerly, so this is a final id and is
			// assignable to `OriginatorlessEncodedId` at runtime.
			const result = decodeOriginatorlessEncodedId(
				opSpaceId as unknown as OriginatorlessEncodedId,
				testIdCompressor,
			);
			assert.equal(result, compressedId);
		});

		it("asserts when handed a non-final compressed id at runtime", () => {
			const { opSpaceId } = makeUnresolvableOpSpaceId();
			assert.throws(
				() =>
					decodeOriginatorlessEncodedId(
						opSpaceId as unknown as OriginatorlessEncodedId,
						testIdCompressor,
					),
				validateAssertionError(/OriginatorlessEncodedId must be a finalized/),
			);
		});
	});

	describe("decodeEncodedIdWithOriginator", () => {
		it("normalizes a local op-space id back to its session-space form using the originator", () => {
			const remoteSession = createSessionId();
			const remoteCompressor = createIdCompressor(remoteSession);
			const remoteSessionSpaceId = remoteCompressor.generateCompressedId();
			const remoteOpSpaceId = remoteCompressor.normalizeToOpSpace(remoteSessionSpaceId);

			// The remote op-space id is non-final and unresolvable without the
			// originator session. With the correct originator, it normalizes.
			const result = decodeEncodedIdWithOriginator(
				remoteOpSpaceId,
				remoteSession,
				remoteCompressor,
			);
			assert.equal(result, remoteSessionSpaceId);
		});

		it("returns the same value for a finalized op-space id regardless of the originator passed", () => {
			// `testIdCompressor` finalizes eagerly: this id is final.
			const compressedId = testIdCompressor.generateCompressedId();
			const opSpaceId = testIdCompressor.normalizeToOpSpace(compressedId);
			const arbitraryOriginator = createSessionId();
			const result = decodeEncodedIdWithOriginator(
				opSpaceId,
				arbitraryOriginator,
				testIdCompressor,
			);
			assert.equal(result, compressedId);
		});
	});

	describe("tryDecodeEncodedIdWithoutSession", () => {
		it("returns a session-space id for a finalized compressed id", () => {
			const compressedId = testIdCompressor.generateCompressedId();
			const opSpaceId = testIdCompressor.normalizeToOpSpace(compressedId);
			const result = tryDecodeEncodedIdWithoutSession(opSpaceId, testIdCompressor);
			assert.equal(result, compressedId);
		});

		it("returns undefined for a non-final compressed id", () => {
			const { opSpaceId } = makeUnresolvableOpSpaceId();
			const result = tryDecodeEncodedIdWithoutSession(opSpaceId, testIdCompressor);
			assert.equal(result, undefined);
		});
	});

	describe("forceDecodeEncodedIdWithoutSession", () => {
		const sharedObjectId = "doc-a";

		it("returns a session-space id for a finalized op-space id", () => {
			const compressedId = testIdCompressor.generateCompressedId();
			const opSpaceId = testIdCompressor.normalizeToOpSpace(compressedId);
			const result = forceDecodeEncodedIdWithoutSession(
				opSpaceId,
				testIdCompressor,
				undefined,
			);
			assert.equal(result, compressedId);
		});

		it("throws on a non-final op-space id when healing is disabled", () => {
			const { opSpaceId } = makeUnresolvableOpSpaceId();
			assert.throws(
				() => forceDecodeEncodedIdWithoutSession(opSpaceId, testIdCompressor, undefined),
				/Summary could not be loaded due to an incorrectly encoded identifier/,
			);
		});

		it("synthesizes a deterministic UUIDv5 on a non-final op-space id when healing is enabled", () => {
			const { opSpaceId } = makeUnresolvableOpSpaceId();
			const result = forceDecodeEncodedIdWithoutSession(opSpaceId, testIdCompressor, {
				sharedObjectId,
			});
			assert.equal(typeof result, "string");
			// Spot-check the exact value to lock in the v5 derivation — every client
			// loading the same blob must compute the same UUID for consensus.
			assert.equal(result, "d5d534e7-5e2c-53c3-b26c-9fd81e6fbc37");
		});

		it("produces the same UUID for the same (sharedObjectId, opSpaceId) inputs", () => {
			const { opSpaceId } = makeUnresolvableOpSpaceId();
			const heal = (): unknown =>
				forceDecodeEncodedIdWithoutSession(opSpaceId, testIdCompressor, {
					sharedObjectId,
				});
			assert.equal(heal(), heal());
		});

		it("produces different UUIDs for different sharedObjectIds", () => {
			const { opSpaceId } = makeUnresolvableOpSpaceId();
			const heal = (sid: string): unknown =>
				forceDecodeEncodedIdWithoutSession(opSpaceId, testIdCompressor, {
					sharedObjectId: sid,
				});
			assert.notEqual(heal("doc-a"), heal("doc-b"));
		});

		it("produces different UUIDs for different op-space ids", () => {
			const foreignSession = createSessionId();
			const foreignCompressor = createIdCompressor(foreignSession);
			const opSpaceA = foreignCompressor.normalizeToOpSpace(
				foreignCompressor.generateCompressedId(),
			);
			const opSpaceB = foreignCompressor.normalizeToOpSpace(
				foreignCompressor.generateCompressedId(),
			);
			assert.notEqual(opSpaceA, opSpaceB);
			const heal = (id: OpSpaceCompressedId): unknown =>
				forceDecodeEncodedIdWithoutSession(id, testIdCompressor, { sharedObjectId });
			assert.notEqual(heal(opSpaceA), heal(opSpaceB));
		});

		it("does not invoke the heal path when the id is resolvable, even with healing enabled", () => {
			const compressedId = testIdCompressor.generateCompressedId();
			const opSpaceId = testIdCompressor.normalizeToOpSpace(compressedId);
			const result = forceDecodeEncodedIdWithoutSession(opSpaceId, testIdCompressor, {
				sharedObjectId,
			});
			// The id is final, so the result is a session-space id (numeric), not a v5 UUID string.
			assert.equal(result, compressedId);
			assert.equal(typeof result, "number");
		});
	});

	describe("decompressIdentifierIfNeeded", () => {
		it("passes string inputs through unchanged", () => {
			const v5RoundTrip = "d5d534e7-5e2c-53c3-b26c-9fd81e6fbc37";
			const result = decompressIdentifierIfNeeded(v5RoundTrip, testIdCompressor);
			assert.equal(result, v5RoundTrip);
		});

		it("decompresses a session-space compressed id to its UUID string", () => {
			const compressedId = testIdCompressor.generateCompressedId();
			const expected = testIdCompressor.decompress(compressedId);
			const result = decompressIdentifierIfNeeded(compressedId, testIdCompressor);
			assert.equal(result, expected);
			assert.equal(typeof result, "string");
		});
	});

	describe("module shape", () => {
		// Type-only assertions to lock in the documented signature shapes. These
		// have no runtime cost and exist to catch regressions where someone
		// narrows or widens a helper's signature accidentally.
		it("helper return types match the documented arms", () => {
			const compressedId = testIdCompressor.generateCompressedId();
			const opSpaceId = testIdCompressor.normalizeToOpSpace(compressedId);

			const a: SessionSpaceCompressedId = decodeOriginatorlessEncodedId(
				opSpaceId as unknown as OriginatorlessEncodedId,
				testIdCompressor,
			);
			const b: SessionSpaceCompressedId = decodeEncodedIdWithOriginator(
				opSpaceId,
				testIdCompressor.localSessionId,
				testIdCompressor,
			);
			const c: SessionSpaceCompressedId | undefined = tryDecodeEncodedIdWithoutSession(
				opSpaceId,
				testIdCompressor,
			);
			const d: SessionSpaceCompressedId | string = forceDecodeEncodedIdWithoutSession(
				opSpaceId,
				testIdCompressor,
				undefined,
			);
			const e: string = decompressIdentifierIfNeeded(compressedId, testIdCompressor);
			assert(a !== undefined);
			assert(b !== undefined);
			assert(c !== undefined);
			assert(d !== undefined);
			assert(e !== undefined);
		});
	});
});
