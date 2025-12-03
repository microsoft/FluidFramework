/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

export type {
	IAttributionCollection,
	IAttributionCollectionSerializer,
	IAttributionCollectionSpec,
	SerializedAttributionCollection,
	SequenceOffsets,
} from "./attributionCollection.js";
export {
	createInsertOnlyAttributionPolicy,
	createPropertyTrackingAttributionPolicyFactory,
	createPropertyTrackingAndInsertionAttributionPolicyFactory,
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
	createDetachedLocalReferencePosition,
	LocalReferenceCollection,
	type LocalReferencePosition,
	SlidingPreference,
} from "./localReference.js";
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
	segmentIsRemoved,
	type ISegment,
	type ISegmentAction,
	Marker,
	reservedMarkerIdKey,
	reservedMarkerSimpleTypeKey,
	type ISegmentInternal,
} from "./mergeTreeNodes.js";
export {
	type Trackable,
	TrackingGroup,
	type ITrackingGroup,
	TrackingGroupCollection,
} from "./mergeTreeTracking.js";
export {
	createAnnotateRangeOp,
	createGroupOp,
	createInsertOp,
	createInsertSegmentOp,
	createRemoveRangeOp,
	createObliterateRangeOp,
} from "./opBuilder.js";
export {
	type AdjustParams,
	type IJSONSegment,
	type IMarkerDef,
	type IMergeTreeAnnotateMsg,
	type IMergeTreeDelta,
	type IMergeTreeDeltaOp,
	type IMergeTreeGroupMsg,
	type IMergeTreeInsertMsg,
	type IMergeTreeOp,
	type IMergeTreeRemoveMsg,
	type IMergeTreeAnnotateAdjustMsg,
	type IRelativePosition,
	MergeTreeDeltaType,
	ReferenceType,
	type IMergeTreeObliterateMsg,
	type IMergeTreeObliterateSidedMsg,
} from "./ops.js";
export {
	addProperties,
	createMap,
	type MapLike,
	matchProperties,
	type PropertySet,
} from "./properties.js";
export {
	compareReferencePositions,
	DetachedReferencePosition,
	maxReferencePosition,
	minReferencePosition,
	type ReferencePosition,
	refGetTileLabels,
	refHasTileLabel,
	refHasTileLabels,
	refTypeIncludesFlag,
	reservedRangeLabelsKey,
	reservedTileLabelsKey,
} from "./referencePositions.js";
export {
	type PropsOrAdjust,
	copyPropertiesAndManager,
	PropertiesManager,
} from "./segmentPropertiesManager.js";
export {
	type InteriorSequencePlace,
	Side,
	type SequencePlace,
	endpointPosAndSide,
} from "./sequencePlace.js";
export { SortedSet } from "./sortedSet.js";
export { SortedSegmentSet, type SortedSegmentSetItem } from "./sortedSegmentSet.js";
export { type IJSONTextSegment, TextSegment } from "./textSegment.js";
export {
	appendToMergeTreeDeltaRevertibles,
	discardMergeTreeDeltaRevertible,
	isMergeTreeDeltaRevertible,
	type MergeTreeDeltaRevertible,
	type MergeTreeRevertibleDriver,
	revertMergeTreeDeltaRevertibles,
} from "./revertibles.js";
export type { OperationStamp } from "./stamps.js";
export { createLocalReconnectingPerspective, type Perspective } from "./perspective.js";
export type { IMergeTreeTextHelper } from "./MergeTreeTextHelper.js";
