/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

export {
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
export { Client, IClientEvents } from "./client.js";
export {
	ConflictAction,
	Dictionary,
	IRBAugmentation,
	IRBMatcher,
	KeyComparer,
	Property,
	PropertyAction,
	QProperty,
	RBColor,
	RBNode,
	RBNodeActions,
	RedBlackTree,
	SortedDictionary,
} from "./collections/index.js";
export { UnassignedSequenceNumber, UniversalSequenceNumber } from "./constants.js";
export {
	createDetachedLocalReferencePosition,
	LocalReferenceCollection,
	LocalReferencePosition,
	SlidingPreference,
} from "./localReference.js";
export {
	AttributionPolicy,
	IMergeTreeAttributionOptions,
	IMergeTreeOptions,
	IMergeTreeOptionsInternal,
	getSlideToSegoff,
} from "./mergeTree.js";
export {
	IMergeTreeClientSequenceArgs,
	IMergeTreeDeltaCallbackArgs,
	IMergeTreeDeltaOpArgs,
	IMergeTreeMaintenanceCallbackArgs,
	IMergeTreeSegmentDelta,
	MergeTreeDeltaOperationType,
	MergeTreeDeltaOperationTypes,
	MergeTreeMaintenanceType,
} from "./mergeTreeDeltaCallback.js";
export {
	BaseSegment,
	CollaborationWindow,
	IJSONMarkerSegment,
	IMergeNodeCommon,
	segmentIsRemoved,
	ISegment,
	ISegmentAction,
	Marker,
	reservedMarkerIdKey,
	reservedMarkerSimpleTypeKey,
	ISegmentInternal,
} from "./mergeTreeNodes.js";
export {
	Trackable,
	TrackingGroup,
	ITrackingGroup,
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
	AdjustParams,
	IJSONSegment,
	IMarkerDef,
	IMergeTreeAnnotateMsg,
	IMergeTreeDelta,
	IMergeTreeDeltaOp,
	IMergeTreeGroupMsg,
	IMergeTreeInsertMsg,
	IMergeTreeOp,
	IMergeTreeRemoveMsg,
	IMergeTreeAnnotateAdjustMsg,
	IRelativePosition,
	MergeTreeDeltaType,
	ReferenceType,
	IMergeTreeObliterateMsg,
	IMergeTreeObliterateSidedMsg,
} from "./ops.js";
export {
	addProperties,
	createMap,
	MapLike,
	matchProperties,
	PropertySet,
} from "./properties.js";
export {
	compareReferencePositions,
	DetachedReferencePosition,
	maxReferencePosition,
	minReferencePosition,
	ReferencePosition,
	refGetTileLabels,
	refHasTileLabel,
	refHasTileLabels,
	refTypeIncludesFlag,
	reservedRangeLabelsKey,
	reservedTileLabelsKey,
} from "./referencePositions.js";
export {
	IMoveInfo,
	IRemovalInfo,
} from "./segmentInfos.js";
export {
	PropsOrAdjust,
	copyPropertiesAndManager,
	PropertiesManager,
	PropertiesRollback,
} from "./segmentPropertiesManager.js";
export {
	InteriorSequencePlace,
	Side,
	SequencePlace,
	endpointPosAndSide,
} from "./sequencePlace.js";
export { SortedSet } from "./sortedSet.js";
export { SortedSegmentSet, SortedSegmentSetItem } from "./sortedSegmentSet.js";
export { IJSONTextSegment, IMergeTreeTextHelper, TextSegment } from "./textSegment.js";
export {
	appendToMergeTreeDeltaRevertibles,
	discardMergeTreeDeltaRevertible,
	isMergeTreeDeltaRevertible,
	MergeTreeDeltaRevertible,
	MergeTreeRevertibleDriver,
	revertMergeTreeDeltaRevertibles,
} from "./revertibles.js";
