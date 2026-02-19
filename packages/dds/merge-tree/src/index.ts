/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

export type {
	IAttributionCollection,
	IAttributionCollectionSerializer,
	IAttributionCollectionSpec,
	SequenceOffsets,
	SerializedAttributionCollection,
} from "./attributionCollection.js";
export {
	createInsertOnlyAttributionPolicy,
	createPropertyTrackingAndInsertionAttributionPolicyFactory,
	createPropertyTrackingAttributionPolicyFactory,
} from "./attributionPolicy.js";
export { Client, type IClientEvents } from "./client.js";
export {
	type ConflictAction,
	type Dictionary,
	type IRBAugmentation,
	type IRBMatcher,
	type KeyComparer,
	type Property,
	type PropertyAction,
	type QProperty,
	RBColor,
	type RBNode,
	type RBNodeActions,
	RedBlackTree,
	type SortedDictionary,
} from "./collections/index.js";
export { UnassignedSequenceNumber, UniversalSequenceNumber } from "./constants.js";
export {
	LocalReferenceCollection,
	type LocalReferencePosition,
	SlidingPreference,
	createDetachedLocalReferencePosition,
} from "./localReference.js";
export type { IMergeTreeTextHelper } from "./MergeTreeTextHelper.js";
export {
	type AttributionPolicy,
	type IMergeTreeAttributionOptions,
	type IMergeTreeOptions,
	type IMergeTreeOptionsInternal,
	getSlideToSegoff,
} from "./mergeTree.js";
export {
	type IMergeTreeDeltaCallbackArgs,
	type IMergeTreeDeltaOpArgs,
	type IMergeTreeMaintenanceCallbackArgs,
	type IMergeTreeSegmentDelta,
	type MergeTreeDeltaOperationType,
	type MergeTreeDeltaOperationTypes,
	MergeTreeMaintenanceType,
} from "./mergeTreeDeltaCallback.js";
export {
	BaseSegment,
	CollaborationWindow,
	type IJSONMarkerSegment,
	type ISegment,
	type ISegmentAction,
	type ISegmentInternal,
	Marker,
	reservedMarkerIdKey,
	reservedMarkerSimpleTypeKey,
	segmentIsRemoved,
} from "./mergeTreeNodes.js";
export {
	type ITrackingGroup,
	type Trackable,
	TrackingGroup,
	TrackingGroupCollection,
} from "./mergeTreeTracking.js";
export {
	createAnnotateRangeOp,
	createGroupOp,
	createInsertOp,
	createInsertSegmentOp,
	createObliterateRangeOp,
	createRemoveRangeOp,
} from "./opBuilder.js";
export {
	type AdjustParams,
	type IJSONSegment,
	type IMarkerDef,
	type IMergeTreeAnnotateAdjustMsg,
	type IMergeTreeAnnotateMsg,
	type IMergeTreeDelta,
	type IMergeTreeDeltaOp,
	type IMergeTreeGroupMsg,
	type IMergeTreeInsertMsg,
	type IMergeTreeObliterateMsg,
	type IMergeTreeObliterateSidedMsg,
	type IMergeTreeOp,
	type IMergeTreeRemoveMsg,
	type IRelativePosition,
	MergeTreeDeltaType,
	ReferenceType,
} from "./ops.js";
export { type Perspective, createLocalReconnectingPerspective } from "./perspective.js";
export {
	type MapLike,
	type PropertySet,
	addProperties,
	createMap,
	matchProperties,
} from "./properties.js";
export {
	DetachedReferencePosition,
	type ReferencePosition,
	compareReferencePositions,
	maxReferencePosition,
	minReferencePosition,
	refGetTileLabels,
	refHasTileLabel,
	refHasTileLabels,
	refTypeIncludesFlag,
	reservedRangeLabelsKey,
	reservedTileLabelsKey,
} from "./referencePositions.js";
export {
	type MergeTreeDeltaRevertible,
	type MergeTreeRevertibleDriver,
	appendToMergeTreeDeltaRevertibles,
	discardMergeTreeDeltaRevertible,
	isMergeTreeDeltaRevertible,
	revertMergeTreeDeltaRevertibles,
} from "./revertibles.js";
export {
	PropertiesManager,
	type PropsOrAdjust,
	copyPropertiesAndManager,
} from "./segmentPropertiesManager.js";
export {
	type InteriorSequencePlace,
	type SequencePlace,
	Side,
	endpointPosAndSide,
} from "./sequencePlace.js";
export { SortedSegmentSet, type SortedSegmentSetItem } from "./sortedSegmentSet.js";
export { SortedSet } from "./sortedSet.js";
export type { OperationStamp } from "./stamps.js";
export { type IJSONTextSegment, TextSegment } from "./textSegment.js";
