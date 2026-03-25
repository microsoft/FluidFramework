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
	createDetachedLocalReferencePosition,
	LocalReferenceCollection,
	type LocalReferencePosition,
	SlidingPreference,
} from "./localReference.js";
export type { IMergeTreeTextHelper } from "./MergeTreeTextHelper.js";
export {
	type AttributionPolicy,
	getSlideToSegoff,
	type IMergeTreeAttributionOptions,
	type IMergeTreeOptions,
	type IMergeTreeOptionsInternal,
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
export { createLocalReconnectingPerspective, type Perspective } from "./perspective.js";
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
	appendToMergeTreeDeltaRevertibles,
	discardMergeTreeDeltaRevertible,
	isMergeTreeDeltaRevertible,
	type MergeTreeDeltaRevertible,
	type MergeTreeRevertibleDriver,
	revertMergeTreeDeltaRevertibles,
} from "./revertibles.js";
export {
	copyPropertiesAndManager,
	PropertiesManager,
	type PropsOrAdjust,
} from "./segmentPropertiesManager.js";
export {
	endpointPosAndSide,
	type InteriorSequencePlace,
	type SequencePlace,
	Side,
} from "./sequencePlace.js";
export { SortedSegmentSet, type SortedSegmentSetItem } from "./sortedSegmentSet.js";
export { SortedSet } from "./sortedSet.js";
export type { OperationStamp } from "./stamps.js";
export { type IJSONTextSegment, TextSegment } from "./textSegment.js";
