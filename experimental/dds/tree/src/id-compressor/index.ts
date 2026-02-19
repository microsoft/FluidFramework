/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

/**
 * Exports for `id-compressor`
 */

export {
	defaultClusterCapacity,
	hasOngoingSession,
	IdCompressor,
	isFinalId,
	isLocalId,
	legacySharedTreeInitialTreeId,
} from './IdCompressor.js';
export { getIds } from './IdRange.js';
export {
	IdCreationRange,
	SerializedCluster,
	SerializedClusterOverrides,
	SerializedIdCompressor,
	SerializedIdCompressorWithNoSession,
	SerializedIdCompressorWithOngoingSession,
	SerializedLocalOverrides,
	SerializedLocalState,
	SerializedSessionData,
	SerializedSessionIdNormalizer,
	UnackedLocalId,
	VersionedSerializedIdCompressor,
} from './persisted-types/index.js';
export { createSessionId } from './NumericUuid.js';
