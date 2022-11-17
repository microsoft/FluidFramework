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
} from "./IdCompressor";
export { getIds } from "./IdRange";
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
} from "./NumericUuid";
export {
    AttributionId,
    StableId,
    CompressedId,
    FinalCompressedId,
    LocalCompressedId,
    OpSpaceCompressedId,
    SessionId,
    SessionSpaceCompressedId,
} from "./Identifiers";
export {
    generateStableId,
    assertIsStableId,
    isStableId,
    assertIsUuidString,
} from "./UuidUtilities";
export { SessionIdNormalizer } from "./SessionIdNormalizer";
