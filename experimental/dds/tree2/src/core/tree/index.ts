/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

export {
	Anchor,
	AnchorLocator,
	AnchorSet,
	AnchorSlot,
	AnchorNode,
	anchorSlot,
	AnchorEvents,
	AnchorSetRootEvents,
} from "./anchorSet";
export {
	ITreeCursor,
	CursorLocationType,
	castCursorToSynchronous,
	mapCursorField,
	mapCursorFields,
	forEachNode,
	forEachNodeInSubtree,
	forEachField,
	iterateCursorField,
	ITreeCursorSynchronous,
	PathRootPrefix,
	inCursorField,
	inCursorNode,
	CursorMarker,
	isCursor,
} from "./cursor";
export {
	ProtoNodes,
	Root as DeltaRoot,
	ProtoNode as DeltaProtoNode,
	Mark as DeltaMark,
	DetachedNodeId as DeltaDetachedNodeId,
	FieldMap as DeltaFieldMap,
	DetachedNodeChanges as DeltaDetachedNodeChanges,
	DetachedNodeBuild as DeltaDetachedNodeBuild,
	DetachedNodeDestruction as DeltaDetachedNodeDestruction,
	DetachedNodeRename as DeltaDetachedNodeRename,
	FieldChanges as DeltaFieldChanges,
} from "./delta";
export { getMapTreeField, MapTree } from "./mapTree";
export {
	clonePath,
	topDownPath,
	getDepth,
	UpPath,
	FieldUpPath,
	Range,
	RangeUpPath,
	PlaceUpPath,
	PlaceIndex,
	NodeIndex,
	DetachedPlaceUpPath,
	DetachedRangeUpPath,
	compareUpPaths,
	compareFieldUpPaths,
	getDetachedFieldContainingPath,
	UpPathDefault,
} from "./pathTree";
export {
	FieldMapObject,
	GenericFieldsNode,
	genericTreeDeleteIfEmpty,
	genericTreeKeys,
	GenericTreeNode,
	getGenericTreeField,
	JsonableTree,
	setGenericTreeField,
} from "./treeTextFormat";
export { EncodedJsonableTree } from "./persistedTreeTextFormat";
export {
	EmptyKey,
	TreeType,
	ChildLocation,
	DetachedField,
	ChildCollection,
	RootField,
	Value,
	TreeValue,
	detachedFieldAsKey,
	keyAsDetachedField,
	rootFieldKey,
	NodeData,
	rootField,
	aboveRootPlaceholder,
} from "./types";
export { DeltaVisitor, visitDelta } from "./visitDelta";
export {
	AnnouncedVisitor,
	announceDelta,
	applyDelta,
	combineVisitors,
	makeDetachedFieldIndex,
} from "./visitorUtils";
export { PathVisitor } from "./visitPath";

export { SparseNode, getDescendant } from "./sparseTree";

export {
	deltaForRootInitialization,
	deltaForSet,
	emptyFieldChanges,
	isEmptyFieldChanges,
	makeDetachedNodeId,
	offsetDetachId,
	emptyDelta,
} from "./deltaUtil";

export { DetachedFieldIndex, ForestRootId } from "./detachedFieldIndex";
