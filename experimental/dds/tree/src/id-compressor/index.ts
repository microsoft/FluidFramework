/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

/**
 * Exports for `id-compressor`
 */

export {
	isFinalId,
	isLocalId,
	hasOngoingSession,
	defaultClusterCapacity,
	legacySharedTreeInitialTreeId,
	IdCompressor,
} from './IdCompressor';
export { getIds } from './IdRange';
export {
	SerializedSessionData,
	SerializedClusterOverrides,
	SerializedCluster,
	SerializedLocalOverrides,
	SerializedLocalState,
	SerializedSessionIdNormalizer,
	VersionedSerializedIdCompressor,
	SerializedIdCompressor,
	SerializedIdCompressorWithNoSession,
	SerializedIdCompressorWithOngoingSession,
	IdCreationRange,
	UnackedLocalId,
} from './persisted-types';
export { createSessionId } from './NumericUuid';
