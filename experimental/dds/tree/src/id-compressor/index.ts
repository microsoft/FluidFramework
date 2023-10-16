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
} from './IdCompressor';
export { getIds } from './IdRange';
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
} from './persisted-types';
export { createSessionId } from './NumericUuid';
