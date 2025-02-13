/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

export {
	type Anchor,
	type AnchorLocator,
	AnchorSet,
	type AnchorSlot,
	type AnchorNode,
	anchorSlot,
	type AnchorEvents,
	type AnchorSetRootEvents,
} from "./anchorSet.js";
export {
	type ITreeCursor,
	CursorLocationType,
	castCursorToSynchronous,
	mapCursorField,
	mapCursorFields,
	forEachNode,
	forEachNodeInSubtree,
	forEachField,
	iterateCursorField,
	type ITreeCursorSynchronous,
	type PathRootPrefix,
	inCursorField,
	inCursorNode,
	CursorMarker,
	isCursor,
} from "./cursor.js";
export type {
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
export { type MapTree, type ExclusiveMapTree, deepCopyMapTree } from "./mapTree.js";
export {
	clonePath,
	topDownPath,
	getDepth,
	type UpPath,
	type FieldUpPath,
	type Range,
	type RangeUpPath,
	type PlaceUpPath,
	type PlaceIndex,
	type NodeIndex,
	type DetachedPlaceUpPath,
	type DetachedRangeUpPath,
	compareUpPaths,
	compareFieldUpPaths,
	getDetachedFieldContainingPath,
	type UpPathDefault,
} from "./pathTree.js";
export {
	type FieldMapObject,
	type GenericFieldsNode,
	genericTreeDeleteIfEmpty,
	genericTreeKeys,
	type GenericTreeNode,
	getGenericTreeField,
	type JsonableTree,
	setGenericTreeField,
} from "./treeTextFormat.js";
export { EncodedJsonableTree } from "./persistedTreeTextFormat.js";
export {
	EmptyKey,
	type TreeType,
	type ChildLocation,
	type DetachedField,
	type ChildCollection,
	type RootField,
	type Value,
	type TreeValue,
	detachedFieldAsKey,
	keyAsDetachedField,
	rootFieldKey,
	type NodeData,
	rootField,
	aboveRootPlaceholder,
} from "./types.js";
export { type DeltaVisitor, visitDelta } from "./visitDelta.js";
export {
	type AnnouncedVisitor,
	announceDelta,
	applyDelta,
	createAnnouncedVisitor,
	combineVisitors,
	makeDetachedFieldIndex,
} from "./visitorUtils.js";

export { SparseNode, getDescendant } from "./sparseTree.js";

export {
	deltaForRootInitialization,
	makeDetachedNodeId,
	offsetDetachId,
	emptyDelta,
} from "./deltaUtil.js";

export {
	type TreeChunk,
	dummyRoot,
	cursorChunk,
	tryGetChunk,
	type ChunkedCursor,
} from "./chunk.js";

export { DetachedFieldIndex } from "./detachedFieldIndex.js";
export { type ForestRootId } from "./detachedFieldIndexTypes.js";
