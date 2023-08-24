/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import type { SessionId } from "../identifiers";

/**
 * The serialized contents of an IdCompressor, suitable for persistence in a summary.
 */
export type SerializedIdCompressor = string & {
	readonly _serializedIdCompressor: "8c73c57c-1cf4-4278-8915-6444cb4f6af5";
};

/**
 * The serialized contents of an IdCompressor, suitable for persistence in a summary.
 */
export type SerializedIdCompressorWithNoSession = SerializedIdCompressor & {
	readonly _noLocalState: "3aa2e1e8-cc28-4ea7-bc1a-a11dc3f26dfb";
};

/**
 * The serialized contents of an IdCompressor, suitable for persistence in a summary.
 */
export type SerializedIdCompressorWithOngoingSession = SerializedIdCompressor & {
	readonly _hasLocalState: "1281acae-6d14-47e7-bc92-71c8ee0819cb";
};

/**
 * Data describing a range of session-local IDs (from a remote or local session).
 *
 * A range is composed of local IDs that were generated.
 */
export interface IdCreationRange {
	readonly sessionId: SessionId;
	readonly ids?: {
		readonly firstGenCount: number;
		readonly count: number;
	};
}

/**
 * Roughly equates to a minimum of 1M sessions before we start allocating 64 bit IDs.
 * This value must *NOT* change without careful consideration to compatibility.
 */
export const initialClusterCapacity = 512;

export type IdCreationRangeWithStashedState = IdCreationRange & {
	stashedState: SerializedIdCompressorWithOngoingSession;
};
