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
    numericUuidFromStableId,
    stableIdFromNumericUuid,
    createSessionId,
    incrementUuid,
    ensureSessionUuid,
    getPositiveDelta,
    numericUuidEquals,
} from "./NumericUuid";
export {
    assert,
    fail,
    assertNotUndefined,
    getOrCreate,
    compareStrings,
    Mutable,
    ClosedMap,
} from "./Common";
export {
    CompressedId,
    FinalCompressedId,
    LocalCompressedId,
    OpSpaceCompressedId,
    SessionSpaceCompressedId,
    SessionId,
    AttributionId,
    StableId,
} from "./Identifiers";
export {
    generateStableId,
    isStableId,
    assertIsStableId,
    assertIsUuidString,
} from "./UuidUtilities";
export { SessionIdNormalizer } from "./SessionIdNormalizer";
