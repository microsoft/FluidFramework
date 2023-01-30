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
} from "./idCompressor";
export { getIds } from "./idRange";
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
} from "./persisted-types";
export {
	NumericUuid,
	numericUuidEquals,
	getPositiveDelta,
	createSessionId,
	numericUuidFromStableId,
	stableIdFromNumericUuid,
	incrementUuid,
	ensureSessionUuid,
} from "./numericUuid";
export {
	StableId,
	CompressedId,
	FinalCompressedId,
	LocalCompressedId,
	OpSpaceCompressedId,
	SessionId,
	SessionSpaceCompressedId,
} from "./identifiers";
export {
	generateStableId,
	assertIsStableId,
	isStableId,
	assertIsUuidString,
} from "./uuidUtilities";
export { SessionIdNormalizer } from "./sessionIdNormalizer";
export { fail, Mutable, getOrCreate, compareStrings } from "./utils";
