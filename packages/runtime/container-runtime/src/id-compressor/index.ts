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
	fail,
	assertIsSessionId,
	numericUuidFromStableId,
	offsetNumericUuid,
	stableIdFromNumericUuid,
	subtractNumericUuids,
	addNumericUuids,
	readNumericUuid,
	writeNumericUuid,
} from "./utilities";
export { AppendOnlySortedMap } from "./appendOnlySortedMap";
export { SessionSpaceNormalizer } from "./sessionSpaceNormalizer";
