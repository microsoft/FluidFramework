/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

export { GarbageCollector } from "./garbageCollection.js";
export {
	// eslint-disable-next-line import/no-deprecated
	nextGCVersion,
	defaultInactiveTimeoutMs,
	defaultSweepGracePeriodMs,
	defaultSessionExpiryDurationMs,
	// eslint-disable-next-line import/no-deprecated
	GCNodeType,
	gcTestModeKey,
	gcGenerationOptionName,
	// eslint-disable-next-line import/no-deprecated
	GCFeatureMatrix,
	// eslint-disable-next-line import/no-deprecated
	GCVersion,
	gcVersionUpgradeToV4Key,
	IGarbageCollectionRuntime,
	IGarbageCollector,
	IGarbageCollectorConfigs,
	IGarbageCollectorCreateParams,
	// eslint-disable-next-line import/no-deprecated
	IGCMetadata,
	// eslint-disable-next-line import/no-deprecated
	IGCMetadata_Deprecated,
	IGCNodeUpdatedProps,
	IGCResult,
	IGCRuntimeOptions,
	// eslint-disable-next-line import/no-deprecated
	IMarkPhaseStats,
	// eslint-disable-next-line import/no-deprecated
	ISweepPhaseStats,
	// eslint-disable-next-line import/no-deprecated
	IGCStats,
	oneDayMs,
	runSessionExpiryKey,
	// eslint-disable-next-line import/no-deprecated
	stableGCVersion,
	UnreferencedState,
	disableThrowOnTombstoneLoadKey,
	GarbageCollectionMessage,
	GarbageCollectionMessageType,
	ISweepMessage,
} from "./gcDefinitions.js";
export {
	cloneGCData,
	concatGarbageCollectionStates,
	// eslint-disable-next-line import/no-deprecated
	getGCVersionInEffect,
	unpackChildNodesGCDetails,
	urlToGCNodePath,
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
export { GCTelemetryTracker } from "./gcTelemetry.js";
export { UnreferencedStateTracker } from "./gcUnreferencedStateTracker.js";
