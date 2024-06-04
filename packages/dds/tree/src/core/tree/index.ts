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
} from "./anchorSet.js";
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
} from "./cursor.js";
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
} from "./delta.js";
export { MapTree } from "./mapTree.js";
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
} from "./pathTree.js";
export {
	FieldMapObject,
	GenericFieldsNode,
	genericTreeDeleteIfEmpty,
	genericTreeKeys,
	GenericTreeNode,
	getGenericTreeField,
	JsonableTree,
	setGenericTreeField,
} from "./treeTextFormat.js";
export { EncodedJsonableTree } from "./persistedTreeTextFormat.js";
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
} from "./types.js";
export { DeltaVisitor, visitDelta } from "./visitDelta.js";
export {
	AnnouncedVisitor,
	announceDelta,
	applyDelta,
	combineVisitors,
	makeDetachedFieldIndex,
} from "./visitorUtils.js";
export { PathVisitor } from "./visitPath.js";

export { SparseNode, getDescendant } from "./sparseTree.js";

export {
	deltaForRootInitialization,
	emptyFieldChanges,
	isEmptyFieldChanges,
	makeDetachedNodeId,
	offsetDetachId,
	emptyDelta,
} from "./deltaUtil.js";

export { DetachedFieldIndex, ForestRootId } from "./detachedFieldIndex.js";
