/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

/**
 * Exports for `id-compressor`
 */

export { IdCompressor } from "./idCompressor";
export {
	compareFiniteNumbers,
	createSessionId,
	assertIsSessionId,
	numericUuidFromStableId,
	offsetNumericUuid,
	stableIdFromNumericUuid,
	subtractNumericUuids,
	addNumericUuids,
	assertIsStableId,
	generateStableId,
	isStableId,
} from "./utilities";
export { readNumericUuid, writeNumericUuid } from "./persistanceUtilities";
export { AppendOnlySortedMap } from "./appendOnlySortedMap";
export { SessionSpaceNormalizer } from "./sessionSpaceNormalizer";
