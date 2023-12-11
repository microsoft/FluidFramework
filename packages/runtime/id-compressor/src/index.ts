/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

/**
 * Exports for `id-compressor`
 */

export { createIdCompressor, deserializeIdCompressor } from "./idCompressor";
export { createSessionId } from "./utilities";
export {
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
	initialClusterCapacity,
} from "./types";
