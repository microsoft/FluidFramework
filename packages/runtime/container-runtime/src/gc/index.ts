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
	gcDisableDataStoreSweepOptionName,
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
	IGCMetadata_Deprecated,
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
	disableAutoRecoveryKey,
	disableDatastoreSweepKey,
	detectOutboundRoutesViaDDSKey,
	UnreferencedState,
	throwOnTombstoneLoadOverrideKey,
	GarbageCollectionMessage,
	GarbageCollectionMessageType,
	ISweepMessage,
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
