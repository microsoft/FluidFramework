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
	type TreeChunk,
	cursorChunk,
	dummyRoot,
	tryGetChunk,
} from "./chunk.js";
export {
	CursorLocationType,
	CursorMarker,
	type ITreeCursor,
	type ITreeCursorSynchronous,
	type PathRootPrefix,
	castCursorToSynchronous,
	forEachField,
	forEachNode,
	forEachNodeInSubtree,
	inCursorField,
	inCursorNode,
	isCursor,
	iterateCursorField,
	mapCursorField,
	mapCursorFields,
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
export { type ExclusiveMapTree, type MapTree, deepCopyMapTree } from "./mapTree.js";
export {
	type FieldUpPath,
	type INormalizedUpPath,
	type NodeIndex,
	type NormalizedFieldUpPath,
	type NormalizedUpPath,
	type PlaceIndex,
	type PlaceUpPath,
	type Range,
	type RangeUpPath,
	type UpPath,
	type UpPathDefault,
	clonePath,
	compareFieldUpPaths,
	compareUpPaths,
	getDepth,
	getDetachedFieldContainingPath,
	isDetachedUpPathRoot as isDetachedUpPath,
	topDownPath,
} from "./pathTree.js";
export { EncodedJsonableTree } from "./persistedTreeTextFormat.js";
export { SparseNode, getDescendant } from "./sparseTree.js";
export {
	type FieldMapObject,
	type GenericFieldsNode,
	type GenericTreeNode,
	type JsonableTree,
	genericTreeDeleteIfEmpty,
	genericTreeKeys,
	getGenericTreeField,
	setGenericTreeField,
} from "./treeTextFormat.js";
export {
	type ChildCollection,
	type ChildLocation,
	type DetachedField,
	EmptyKey,
	type NodeData,
	type RootField,
	type TreeType,
	type TreeValue,
	type Value,
	aboveRootPlaceholder,
	detachedFieldAsKey,
	keyAsDetachedField,
	rootField,
	rootFieldKey,
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
