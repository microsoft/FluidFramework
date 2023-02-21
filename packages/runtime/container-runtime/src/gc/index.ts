/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

export { GarbageCollector } from "./garbageCollection";
export {
	currentGCVersion,
	defaultInactiveTimeoutMs,
	defaultSessionExpiryDurationMs,
	disableSweepLogKey,
	GCNodeType,
	gcTestModeKey,
	gcTombstoneGenerationOptionName,
	GCVersion,
	gcVersionUpgradeToV2Key,
	IGarbageCollectionRuntime,
	IGarbageCollector,
	IGarbageCollectorCreateParams,
	IGCMetadata,
	IGCStats,
	oneDayMs,
	runGCKey,
	runSessionExpiryKey,
	runSweepKey,
	stableGCVersion,
	sweepAttachmentBlobsKey,
	sweepDatastoresKey,
	throwOnTombstoneLoadKey,
	throwOnTombstoneUsageKey,
	UnreferencedState,
} from "./gcDefinitions";
export { sendGCUnexpectedUsageEvent, shouldAllowGcTombstoneEnforcement } from "./gcHelpers";
export { GCSummaryStateTracker } from "./gcSummaryStateTracker";
export {
	skipClosureForXDaysKey,
	closuresMapLocalStorageKey,
	SweepReadyUsageDetectionHandler,
} from "./gcSweepReadyUsageDetection";
export { UnreferencedStateTracker } from "./gcUnreferencedStateTracker";
