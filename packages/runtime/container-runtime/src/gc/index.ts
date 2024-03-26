/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

export { GarbageCollector } from "./garbageCollection.js";
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
} from "./gcDefinitions.js";
export {
	cloneGCData,
	concatGarbageCollectionStates,
	trimLeadingAndTrailingSlashes,
	unpackChildNodesGCDetails,
} from "./gcHelpers.js";
export { runGarbageCollection } from "./gcReferenceGraphAlgorithm.js";
export {
	IGarbageCollectionNodeData,
	IGarbageCollectionSnapshotData,
	IGarbageCollectionState,
	IGarbageCollectionSummaryDetailsLegacy,
} from "./gcSummaryDefinitions.js";
export {
	gcStateBlobKey,
	GCSummaryStateTracker,
	IGCSummaryTrackingData,
} from "./gcSummaryStateTracker.js";
export { GCTelemetryTracker, sendGCUnexpectedUsageEvent } from "./gcTelemetry.js";
export { UnreferencedStateTracker } from "./gcUnreferencedStateTracker.js";
