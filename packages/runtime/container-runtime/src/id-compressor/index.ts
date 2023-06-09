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
} from "./idCompressor";
export { getIds } from "./idRange";
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
	generateStableId,
	assertIsStableId,
	isStableId,
	assertIsUuidString,
} from "./uuidUtilities";
export { SessionIdNormalizer } from "./sessionIdNormalizer";
export { fail, Mutable, getOrCreate, compareStrings } from "./utils";
