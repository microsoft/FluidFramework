/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

/**
 * Exports for `id-compressor`
 */

export {
	createIdCompressor,
	deserializeIdCompressor,
	serializeIdCompressor,
	toIdCompressorWithCore,
} from "./idCompressor.js";
export { SerializationVersion } from "./types/index.js";
export { type FinalCompressedId, isFinalId } from "./identifiers.js";
export {
	createSessionId,
	assertIsStableId,
	generateStableId,
	isStableId,
} from "./utilities.js";
export type {
	IdCreationRange,
	IIdCompressor,
	IIdCompressorCore,
	IdCompressorEvents,
	OpSpaceCompressedId,
	ParentShardSynchronizationToken,
	SerializedIdCompressor,
	SerializedIdCompressorWithNoSession,
	SerializedIdCompressorWithOngoingSession,
	SerializedIdCompressorShard,
	SessionId,
	SessionSpaceCompressedId,
	ShardSynchronizationToken,
	ShardToken,
	StableId,
} from "./types/index.js";
