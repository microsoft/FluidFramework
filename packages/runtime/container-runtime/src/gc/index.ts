/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

export {
	UnreferencedState,
	UnreferencedStateTracker,
	GarbageCollector,
	GCNodeType,
	IGarbageCollectionRuntime,
	IGarbageCollector,
	IGarbageCollectorCreateParams,
	IGCStats,
} from "./garbageCollection";
export {
	sendGCUnexpectedUsageEvent,
	shouldAllowGcTombstoneEnforcement,
} from "./garbageCollectionHelpers";
export {
	defaultSessionExpiryDurationMs,
	gcTombstoneGenerationOptionName,
	sweepDatastoresKey,
	throwOnTombstoneLoadKey,
	throwOnTombstoneUsageKey,
	runSessionExpiryKey,
	oneDayMs,
	runGCKey,
	runSweepKey,
	defaultInactiveTimeoutMs,
	gcTestModeKey,
	disableSweepLogKey,
	gcVersionUpgradeToV2Key,
	currentGCVersion,
	stableGCVersion,
} from "./garbageCollectionConstants";
export {
	skipClosureForXDaysKey,
	closuresMapLocalStorageKey,
	SweepReadyUsageDetectionHandler,
} from "./gcSweepReadyUsageDetection";
