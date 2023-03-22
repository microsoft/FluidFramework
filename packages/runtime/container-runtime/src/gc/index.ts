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
	gcSweepGenerationOptionName,
	GCFeatureMatrix,
	GCVersion,
	gcVersionUpgradeToV2Key,
	IGarbageCollectionRuntime, // Deprecated
	IGarbageCollector,
	IGarbageCollectorConfigs,
	IGarbageCollectorCreateParams,
	IGCMetadata,
	IGCRuntimeOptions,
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
export {
	getSnapshotDataFromOldSnapshotFormat,
	sendGCUnexpectedUsageEvent,
	shouldAllowGcTombstoneEnforcement,
	shouldAllowGcSweep,
} from "./gcHelpers";
export { GCSummaryStateTracker } from "./gcSummaryStateTracker";
export {
	skipClosureForXDaysKey,
	closuresMapLocalStorageKey,
	SweepReadyUsageDetectionHandler,
} from "./gcSweepReadyUsageDetection";
export { UnreferencedStateTracker } from "./gcUnreferencedStateTracker";
