/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

export {
	type Anchor,
	type AnchorEvents,
	type AnchorLocator,
	type AnchorNode,
	AnchorSet,
	type AnchorSetRootEvents,
	type AnchorSlot,
	anchorSlot,
} from "./anchorSet.js";
export {
	type ChunkedCursor,
	cursorChunk,
	dummyRoot,
	type TreeChunk,
	tryGetChunk,
} from "./chunk.js";
export {
	CursorLocationType,
	CursorMarker,
	castCursorToSynchronous,
	forEachField,
	forEachNode,
	forEachNodeInSubtree,
	type ITreeCursor,
	type ITreeCursorSynchronous,
	inCursorField,
	inCursorNode,
	isCursor,
	iterateCursorField,
	mapCursorField,
	mapCursorFields,
	type PathRootPrefix,
} from "./cursor.js";
export type {
	DetachedNodeBuild as DeltaDetachedNodeBuild,
	DetachedNodeChanges as DeltaDetachedNodeChanges,
	DetachedNodeDestruction as DeltaDetachedNodeDestruction,
	DetachedNodeId as DeltaDetachedNodeId,
	DetachedNodeRename as DeltaDetachedNodeRename,
	FieldChanges as DeltaFieldChanges,
	FieldMap as DeltaFieldMap,
	Mark as DeltaMark,
	ProtoNodes,
	Root as DeltaRoot,
} from "./delta.js";
export {
	deltaForRootInitialization,
	emptyDelta,
	makeDetachedNodeId,
	offsetDetachId,
} from "./deltaUtil.js";
export {
	DetachedFieldIndex,
	type DetachedFieldIndexCheckpoint,
	type ReadOnlyDetachedFieldIndex,
} from "./detachedFieldIndex.js";
export { detachedFieldIndexCodecBuilder } from "./detachedFieldIndexCodecs.js";
export { DetachedFieldIndexFormatVersion } from "./detachedFieldIndexFormatCommon.js";
export { type FormatV1 } from "./detachedFieldIndexFormatV1.js";
export { type ForestRootId } from "./detachedFieldIndexTypes.js";
export { deepCopyMapTree, type ExclusiveMapTree, type MapTree } from "./mapTree.js";
export {
	clonePath,
	compareFieldUpPaths,
	compareUpPaths,
	type FieldUpPath,
	getDepth,
	getDetachedFieldContainingPath,
	type INormalizedUpPath,
	isDetachedUpPathRoot as isDetachedUpPath,
	type NodeIndex,
	type NormalizedFieldUpPath,
	type NormalizedUpPath,
	type PlaceIndex,
	type PlaceUpPath,
	type Range,
	type RangeUpPath,
	topDownPath,
	type UpPath,
	type UpPathDefault,
} from "./pathTree.js";
export { EncodedJsonableTree } from "./persistedTreeTextFormat.js";
export { getDescendant, SparseNode } from "./sparseTree.js";
export {
	type FieldMapObject,
	type GenericFieldsNode,
	type GenericTreeNode,
	genericTreeDeleteIfEmpty,
	genericTreeKeys,
	getGenericTreeField,
	type JsonableTree,
	setGenericTreeField,
} from "./treeTextFormat.js";
export {
	aboveRootPlaceholder,
	type ChildCollection,
	type ChildLocation,
	type DetachedField,
	detachedFieldAsKey,
	EmptyKey,
	keyAsDetachedField,
	type NodeData,
	type RootField,
	rootField,
	rootFieldKey,
	type TreeType,
	type TreeValue,
	type Value,
} from "./types.js";
export { type DeltaVisitor, visitDelta } from "./visitDelta.js";
export {
	type AnnouncedVisitor,
	announceDelta,
	applyDelta,
	combineVisitors,
	createAnnouncedVisitor,
	makeDetachedFieldIndex,
} from "./visitorUtils.js";
