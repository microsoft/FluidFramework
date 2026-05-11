/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

export { GarbageCollector } from "./garbageCollection.js";
export { computeTombstoneTimeout } from "./gcConfigs.js";
export {
	nextGCVersion,
	defaultInactiveTimeoutMs,
	defaultSweepGracePeriodMs,
	defaultSessionExpiryDurationMs,
	GCNodeType,
	gcTestModeKey,
	gcGenerationOptionName,
	type GCFeatureMatrix,
	type GCVersion,
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
	type IMarkPhaseStats,
	type ISweepPhaseStats,
	type IGCStats,
	oneDayMs,
	runSessionExpiryKey,
	stableGCVersion,
	UnreferencedState,
	disableThrowOnTombstoneLoadKey,
	type GarbageCollectionMessage,
	GarbageCollectionMessageType,
	type ISweepMessage,
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
	gcStateBlobKey,
	GCSummaryStateTracker,
	type IGCSummaryTrackingData,
} from "./gcSummaryStateTracker.js";
export { GCTelemetryTracker } from "./gcTelemetry.js";
export { UnreferencedStateTracker } from "./gcUnreferencedStateTracker.js";
