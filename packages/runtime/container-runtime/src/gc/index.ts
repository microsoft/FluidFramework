/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

export { GarbageCollector } from "./garbageCollection";
export {
	nextGCVersion,
	defaultInactiveTimeoutMs,
	defaultSweepGracePeriodMs,
	defaultSessionExpiryDurationMs,
	GCNodeType,
	gcTestModeKey,
	gcDisableThrowOnTombstoneLoadOptionName,
	gcGenerationOptionName,
	GCFeatureMatrix,
	GCVersion,
	gcVersionUpgradeToV4Key,
	IGarbageCollectionRuntime,
	IGarbageCollector,
	IGarbageCollectorConfigs,
	IGarbageCollectorCreateParams,
	IGCMetadata,
	IGCResult,
	IGCRuntimeOptions,
	IMarkPhaseStats,
	ISweepPhaseStats,
	IGCStats,
	oneDayMs,
	runGCKey,
	runSessionExpiryKey,
	runSweepKey,
	stableGCVersion,
	disableAttachmentBlobSweepKey,
	disableDatastoreSweepKey,
	UnreferencedState,
	throwOnTombstoneLoadOverrideKey,
	GarbageCollectionMessage,
} from "./gcDefinitions";
export {
	cloneGCData,
	concatGarbageCollectionStates,
	trimLeadingAndTrailingSlashes,
	unpackChildNodesGCDetails,
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
