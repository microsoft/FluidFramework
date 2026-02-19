/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

export { GarbageCollector } from "./garbageCollection.js";
export { computeTombstoneTimeout } from "./gcConfigs.js";
export {
	type GCFeatureMatrix,
	GCNodeType,
	type GCVersion,
	type GarbageCollectionMessage,
	GarbageCollectionMessageType,
	type IGCMetadata,
	type IGCMetadata_Deprecated,
	type IGCNodeUpdatedProps,
	type IGCResult,
	type IGCRuntimeOptions,
	type IGCStats,
	type IGarbageCollectionRuntime,
	type IGarbageCollector,
	type IGarbageCollectorConfigs,
	type IGarbageCollectorCreateParams,
	type IMarkPhaseStats,
	type ISweepMessage,
	type ISweepPhaseStats,
	UnreferencedState,
	defaultInactiveTimeoutMs,
	defaultSessionExpiryDurationMs,
	defaultSweepGracePeriodMs,
	disableThrowOnTombstoneLoadKey,
	gcGenerationOptionName,
	gcTestModeKey,
	gcVersionUpgradeToV4Key,
	nextGCVersion,
	oneDayMs,
	runSessionExpiryKey,
	stableGCVersion,
} from "./gcDefinitions.js";
export {
	cloneGCData,
	concatGarbageCollectionStates,
	getGCVersionInEffect,
	unpackChildNodesGCDetails,
	urlToGCNodePath,
} from "./gcHelpers.js";
export { runGarbageCollection } from "./gcReferenceGraphAlgorithm.js";
export type {
	IGarbageCollectionNodeData,
	IGarbageCollectionSnapshotData,
	IGarbageCollectionState,
	IGarbageCollectionSummaryDetailsLegacy,
} from "./gcSummaryDefinitions.js";
export {
	GCSummaryStateTracker,
	type IGCSummaryTrackingData,
	gcStateBlobKey,
} from "./gcSummaryStateTracker.js";
export { GCTelemetryTracker } from "./gcTelemetry.js";
export { UnreferencedStateTracker } from "./gcUnreferencedStateTracker.js";
