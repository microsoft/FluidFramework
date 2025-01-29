/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { OpSpaceCompressedId, SessionSpaceCompressedId } from "./types/index.js";

/**
 * A compressed ID that is stable and unique within the scope of network of compressors (i.e. a document).
 * It can only be used/decompressed in the context of the originating document.
 */
export type FinalCompressedId = number & {
	readonly FinalCompressedId: "5d83d1e2-98b7-4e4e-a889-54c855cfa73d";

	// Same brand as OpNormalizedCompressedId, as final IDs are always finally normalized
	readonly OpNormalized: "9209432d-a959-4df7-b2ad-767ead4dbcae";
};

/**
 * A compressed ID that is local to a session (can only be decompressed when paired with a SessionId).
 * Internally, it should not be persisted outside a scope annotated with the originating SessionId in order to be unambiguous.
 * If external persistence is needed (e.g. by a client), a StableId should be used instead.
 */
export type LocalCompressedId = number & {
	readonly LocalCompressedId: "6fccb42f-e2a4-4243-bd29-f13d12b9c6d1";
} & SessionSpaceCompressedId; // Same brand as CompressedId, as local IDs are always locally normalized

/**
 * Returns true if the supplied ID is a final ID.
 */
export function isFinalId(
	id: SessionSpaceCompressedId | OpSpaceCompressedId,
): id is FinalCompressedId {
	return id >= 0;
}

/**
 * A StableId which is suitable for use as a session identifier
 */
export type NumericUuid = bigint & {
	readonly NumericUuid: "be04dd4d-9d7e-4337-a833-eec64c61aa46";
};
