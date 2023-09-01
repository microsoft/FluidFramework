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
	gcVersionUpgradeToV3Key,
	IGarbageCollectionRuntime,
	IGarbageCollector,
	IGarbageCollectorConfigs,
	IGarbageCollectorCreateParams,
	IGCMetadata,
	IGCResult,
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
	shouldAllowGcTombstoneEnforcement,
	shouldAllowGcSweep,
	trimLeadingAndTrailingSlashes,
	unpackChildNodesGCDetails,
	tagAsCodeArtifact,
} from "./gcHelpers";
export { runGarbageCollection } from "./gcReferenceGraphAlgorithm";
export {
	IGarbageCollectionNodeData,
	IGarbageCollectionSnapshotData,
	IGarbageCollectionState,
	IGarbageCollectionSummaryDetailsLegacy,
} from "./gcSummaryDefinitions";
export {
	gcStateBlobKey,
	GCSummaryStateTracker,
	IGCSummaryTrackingData,
} from "./gcSummaryStateTracker";
export { GCTelemetryTracker, sendGCUnexpectedUsageEvent } from "./gcTelemetry";
export { UnreferencedStateTracker } from "./gcUnreferencedStateTracker";
