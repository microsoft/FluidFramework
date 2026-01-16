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
	SerializationVersion,
	type SerializationVersion as SerializationVersionType,
} from "./idCompressor.js";
export {
	createSessionId,
	assertIsStableId,
	generateStableId,
	isStableId,
} from "./utilities.js";
export type {
	IIdCompressorCore,
	IIdCompressor,
	SerializedIdCompressor,
	SerializedIdCompressorWithOngoingSession,
	SerializedIdCompressorWithNoSession,
	SessionSpaceCompressedId,
	OpSpaceCompressedId,
	SessionId,
	StableId,
	IdCreationRange,
	CompressorShardId,
} from "./types/index.js";
