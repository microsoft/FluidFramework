/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

export { GarbageCollector } from "./garbageCollection.js";
export { computeTombstoneTimeout } from "./gcConfigs.js";
export {
	defaultInactiveTimeoutMs,
	defaultSessionExpiryDurationMs,
	defaultSweepGracePeriodMs,
	disableThrowOnTombstoneLoadKey,
	type GarbageCollectionMessage,
	GarbageCollectionMessageType,
	type GCFeatureMatrix,
	GCNodeType,
	type GCVersion,
	gcGenerationOptionName,
	gcTestModeKey,
	gcVersionUpgradeToV4Key,
	type IGarbageCollectionRuntime,
	type IGarbageCollector,
	type IGarbageCollectorConfigs,
	type IGarbageCollectorCreateParams,
	type IGCMetadata,
	type IGCMetadata_Deprecated,
	type IGCNodeUpdatedProps,
	type IGCResult,
	type IGCRuntimeOptions,
	type IGCStats,
	type IMarkPhaseStats,
	type ISweepMessage,
	type ISweepPhaseStats,
	nextGCVersion,
	oneDayMs,
	runSessionExpiryKey,
	stableGCVersion,
	UnreferencedState,
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
	gcStateBlobKey,
	type IGCSummaryTrackingData,
} from "./gcSummaryStateTracker.js";
export { GCTelemetryTracker } from "./gcTelemetry.js";
export { UnreferencedStateTracker } from "./gcUnreferencedStateTracker.js";
