/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

export {
    EmptyKey,
    FieldKey,
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
} from "./types";

export { getDepth, clonePath, UpPath } from "./pathTree";
export { Anchor, AnchorLocator, AnchorSet } from "./anchorSet";
export {
	scopeFromKey,
	isGlobalFieldKey,
	getGenericTreeField,
	setGenericTreeField,
	genericTreeKeys,
	genericTreeDeleteIfEmpty,
	FieldMapObject,
	GenericTreeNode,
	GenericFieldsNode,
	JsonableTree,
	FieldScope,
} from "./treeTextFormat";
export { visitDelta, DeltaVisitor } from "./visitDelta";
export { symbolFromKey, keyFromSymbol, GlobalFieldKeySymbol } from "./globalFieldKeySymbol";
export { getMapTreeField, MapTree } from "./mapTree";

export {
    ITreeCursor as ITreeCursorNew,
    CursorLocationType,
    mapCursorField as mapCursorFieldNew,
    mapCursorFields,
    forEachNode,
    ITreeCursorSynchronous,
} from "./cursor";

// Split this up into separate import and export for compatibility with API-Extractor.
import * as Delta from "./delta";
export { Delta };
