/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "node:assert";

import type { IIdCompressor, SessionId } from "@fluidframework/id-compressor";
import {
	createIdCompressor,
	createSessionId,
	toIdCompressorWithCore,
} from "@fluidframework/id-compressor/internal";

import {
	type ChangeDecodingContext,
	type RevisionTag,
	RevisionTagCodec,
} from "../../core/index.js";
import { IdDecodingContext } from "../../util/index.js";

/**
 * Builds a {@link ChangeDecodingContext} that resolves identifiers using the given compressor and
 * originator session. `revisionTagCodec.decode` resolves solely through the embedded
 * {@link IdDecodingContext}, so the compressor provided here is the one used for resolution.
 */
function makeDecodeContext(
	idCompressor: IIdCompressor,
	originatorId: SessionId,
): ChangeDecodingContext {
	const idDecodingContext = new IdDecodingContext({ idCompressor, originatorId });
	return {
		revision: undefined,
		idCompressor,
		idDecodingContext,
		forestIdDecodingContext: idDecodingContext,
	};
}

describe("RevisionTagCodec", () => {
	it("handles the root constant revision tag", () => {
		const rootRevisionTag: RevisionTag = "root";
		const localCompressor = createIdCompressor(createSessionId());
		const remoteCompressor = createIdCompressor(createSessionId());
		const codec = new RevisionTagCodec(localCompressor);
		const encoded = codec.encode(rootRevisionTag);
		assert.deepEqual(encoded, rootRevisionTag);
		const decoded = codec.decode(
			encoded,
			makeDecodeContext(localCompressor, localCompressor.localSessionId),
		);
		assert.deepEqual(decoded, rootRevisionTag);
		const remoteEncoded = new RevisionTagCodec(remoteCompressor).encode(rootRevisionTag);
		const decodedFromRemote = codec.decode(
			remoteEncoded,
			makeDecodeContext(localCompressor, remoteCompressor.localSessionId),
		);
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
			localCodec.decode(localEncoded, makeDecodeContext(localCompressor, localSession)),
		);
		// A remote client should not be able to decode the local ID, as it has not received
		// the creation range for it
		assert.throws(() =>
			remoteCodec.decode(localEncoded, makeDecodeContext(remoteCompressor, localSession)),
		);

		// Simulate the remote client receiving the creation range for the local ID
		const range = toIdCompressorWithCore(localCompressor).takeNextCreationRange();
		toIdCompressorWithCore(localCompressor).finalizeCreationRange(range);
		toIdCompressorWithCore(remoteCompressor).finalizeCreationRange(range);
		// Locally encoding will have the final ID form, as will the remote client
		localEncoded = localCodec.encode(localId);
		const remoteDecoded = remoteCodec.decode(
			localEncoded,
			makeDecodeContext(remoteCompressor, localSession),
		);
		const remoteEncoded = remoteCodec.encode(remoteDecoded);

		assert.notDeepEqual(localId, localEncoded);
		assert.deepEqual(localEncoded, remoteDecoded);
		assert.deepEqual(remoteEncoded, remoteDecoded);
		assert.deepEqual(
			localEncoded,
			remoteCodec.decode(localEncoded, makeDecodeContext(remoteCompressor, localSession)),
		);
		// Simulate the remote client referencing the local client's ID
		assert.deepEqual(
			localId,
			localCodec.decode(remoteEncoded, makeDecodeContext(localCompressor, remoteSession)),
		);
	});
});
