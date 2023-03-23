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
	IGarbageCollectionRuntime,
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
	cloneGCData,
	concatGarbageCollectionStates,
	getGCDataFromSnapshot,
	getSnapshotDataFromOldSnapshotFormat,
	runGarbageCollection,
	sendGCUnexpectedUsageEvent,
	shouldAllowGcTombstoneEnforcement,
	shouldAllowGcSweep,
	trimLeadingAndTrailingSlashes,
	unpackChildNodesGCDetails,
} from "./gcHelpers";
export {
	IGarbageCollectionNodeData,
	IGarbageCollectionSnapshotData,
	IGarbageCollectionState,
	IGarbageCollectionSummaryDetailsLegacy,
} from "./gcSummaryDefinitions";
export { GCSummaryStateTracker } from "./gcSummaryStateTracker";
export {
	skipClosureForXDaysKey,
	closuresMapLocalStorageKey,
	SweepReadyUsageDetectionHandler,
} from "./gcSweepReadyUsageDetection";
export { UnreferencedStateTracker } from "./gcUnreferencedStateTracker";
