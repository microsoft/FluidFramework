/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

export { GarbageCollector } from "./garbageCollection";
export { sendGCUnexpectedUsageEvent, shouldAllowGcTombstoneEnforcement } from "./gcHelpers";
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
	GCNodeType,
	IGarbageCollectionRuntime,
	IGarbageCollector,
	IGarbageCollectorCreateParams,
	IGCStats,
	UnreferencedState,
} from "./gcDefinitions";
export {
	skipClosureForXDaysKey,
	closuresMapLocalStorageKey,
	SweepReadyUsageDetectionHandler,
} from "./gcSweepReadyUsageDetection";
export { UnreferencedStateTracker } from "./gcUnreferencedStateTracker";
