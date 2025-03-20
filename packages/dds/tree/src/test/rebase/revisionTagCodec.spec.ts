/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "node:assert";

import { createIdCompressor, createSessionId } from "@fluidframework/id-compressor/internal";

import { type RevisionTag, RevisionTagCodec } from "../../core/index.js";
import { testIdCompressor } from "../utils.js";

describe("RevisionTagCodec", () => {
	it("handles the root constant revision tag", () => {
		const rootRevisionTag: RevisionTag = "root";
		const localCompressor = createIdCompressor(createSessionId());
		const remoteCompressor = createIdCompressor(createSessionId());
		const codec = new RevisionTagCodec(localCompressor);
		const encoded = codec.encode(rootRevisionTag);
		assert.deepEqual(encoded, rootRevisionTag);
		const decoded = codec.decode(encoded, {
			originatorId: localCompressor.localSessionId,
			revision: undefined,
			idCompressor: testIdCompressor,
		});
		assert.deepEqual(decoded, rootRevisionTag);
		const remoteEncoded = new RevisionTagCodec(remoteCompressor).encode(rootRevisionTag);
		const decodedFromRemote = codec.decode(remoteEncoded, {
			originatorId: remoteCompressor.localSessionId,
			revision: undefined,
			idCompressor: testIdCompressor,
		});
		assert.deepEqual(decodedFromRemote, rootRevisionTag);
	});

	it("normalizes compressed IDs between op and session space", () => {
		const localSession = createSessionId();
		const remoteSession = createSessionId();
		const localCompressor = createIdCompressor(localSession);
		const remoteCompressor = createIdCompressor(remoteSession);
		const localCodec = new RevisionTagCodec(localCompressor);
		const remoteCodec = new RevisionTagCodec(remoteCompressor);
		// Generate a compressed ID in the local space
		const localId = localCompressor.generateCompressedId();

		// The encoded ID will not have a final ID form
		let localEncoded = localCodec.encode(localId);

		assert.deepEqual(localId, localEncoded);
		assert.deepEqual(
			localId,
			localCodec.decode(localEncoded, {
				originatorId: localSession,
				revision: undefined,
				idCompressor: testIdCompressor,
			}),
		);
		// A remote client should not be able to decode the local ID, as it has not received
		// the creation range for it
		assert.throws(() =>
			remoteCodec.decode(localEncoded, {
				originatorId: localSession,
				revision: undefined,
				idCompressor: testIdCompressor,
			}),
		);

		// Simulate the remote client receiving the creation range for the local ID
		const range = localCompressor.takeNextCreationRange();
		localCompressor.finalizeCreationRange(range);
		remoteCompressor.finalizeCreationRange(range);
		// Locally encoding will have the final ID form, as will the remote client
		localEncoded = localCodec.encode(localId);
		const remoteDecoded = remoteCodec.decode(localEncoded, {
			originatorId: localSession,
			revision: undefined,
			idCompressor: testIdCompressor,
		});
		const remoteEncoded = remoteCodec.encode(remoteDecoded);

		assert.notDeepEqual(localId, localEncoded);
		assert.deepEqual(localEncoded, remoteDecoded);
		assert.deepEqual(remoteEncoded, remoteDecoded);
		assert.deepEqual(
			localEncoded,
			remoteCodec.decode(localEncoded, {
				originatorId: localSession,
				revision: undefined,
				idCompressor: testIdCompressor,
			}),
		);
		// Simulate the remote client referencing the local client's ID
		assert.deepEqual(
			localId,
			localCodec.decode(remoteEncoded, {
				originatorId: remoteSession,
				revision: undefined,
				idCompressor: testIdCompressor,
			}),
		);
	});
});
