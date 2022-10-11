/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

export { Anchor, AnchorLocator, AnchorSet } from "./anchorSet";
export {
    ITreeCursor as ITreeCursorNew,
    CursorLocationType,
    mapCursorField as mapCursorFieldNew,
    mapCursorFields,
    forEachNode,
    ITreeCursorSynchronous,
} from "./cursor";
export {
    GlobalFieldKeySymbol,
    keyFromSymbol,
    symbolFromKey,
    symbolIsFieldKey,
} from "./globalFieldKeySymbol";
export { getMapTreeField, MapTree } from "./mapTree";
export { clonePath, getDepth, UpPath } from "./pathTree";
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
export {
    FieldMapObject,
    FieldScope,
    GenericFieldsNode,
    genericTreeDeleteIfEmpty,
    genericTreeKeys,
    GenericTreeNode,
    getGenericTreeField,
    isGlobalFieldKey,
    JsonableTree,
    scopeFromKey,
    setGenericTreeField,
} from "./treeTextFormat";
export { DeltaVisitor, visitDelta } from "./visitDelta";

// Split this up into separate import and export for compatibility with API-Extractor.
import * as Delta from "./delta";
export { Delta };
