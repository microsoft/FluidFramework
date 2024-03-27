/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import type { SessionId } from "../identifiers.js";

/**
 * The serialized contents of an IdCompressor, suitable for persistence in a summary.
 * @alpha
 */
export type SerializedIdCompressor = string & {
	readonly _serializedIdCompressor: "8c73c57c-1cf4-4278-8915-6444cb4f6af5";
};

/**
 * The serialized contents of an IdCompressor, suitable for persistence in a summary.
 * @alpha
 */
export type SerializedIdCompressorWithNoSession = SerializedIdCompressor & {
	readonly _noLocalState: "3aa2e1e8-cc28-4ea7-bc1a-a11dc3f26dfb";
};

/**
 * The serialized contents of an IdCompressor, suitable for persistence in a summary.
 * @alpha
 */
export type SerializedIdCompressorWithOngoingSession = SerializedIdCompressor & {
	readonly _hasLocalState: "1281acae-6d14-47e7-bc92-71c8ee0819cb";
};

/**
 * Data describing a range of session-local IDs (from a remote or local session).
 *
 * A range is composed of local IDs that were generated.
 * @alpha
 */
export interface IdCreationRange {
	readonly sessionId: SessionId;
	readonly ids?: {
		/**
		 * The gen count of the first ID in the range created by `sessionId.`
		 */
		readonly firstGenCount: number;

		/**
		 * The number of IDs created in the range created by `sessionId.`
		 */
		readonly count: number;

		/**
		 * The size of the ID cluster to create if `count` overflows the existing cluster for
		 * `sessionId`, if one exists. This request will be respected, and the size of the cluster
		 * will be equal to overflow + `requestedClusterSize`.
		 */
		readonly requestedClusterSize: number;
	};
}
