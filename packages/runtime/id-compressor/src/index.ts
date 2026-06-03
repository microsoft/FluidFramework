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
export { type FinalCompressedId, isFinalId } from "./identifiers.js";
export type {
	IdCreationRange,
	IIdCompressor,
	IIdCompressorCore,
	OpSpaceCompressedId,
	SerializedIdCompressor,
	SerializedIdCompressorWithNoSession,
	SerializedIdCompressorWithOngoingSession,
	SessionId,
	SessionSpaceCompressedId,
	StableId,
} from "./types/index.js";
export {
	assertIsStableId,
	createSessionId,
	generateStableId,
	isStableId,
} from "./utilities.js";
