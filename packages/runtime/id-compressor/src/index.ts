/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

/**
 * Exports for `id-compressor`
 */

export { createIdCompressor, deserializeIdCompressor } from "./idCompressor.js";
export type {
	IIdCompressor,
	IIdCompressorCore,
	IdCreationRange,
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
