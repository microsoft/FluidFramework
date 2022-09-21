/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { assert } from "@fluidframework/common-utils";
import {
    FieldMapObject,
    genericTreeKeys,
    getGenericTreeField,
    JsonableTree,
    ITreeCursorNew as ITreeCursor,
    CursorLocationType,
    mapCursorFieldNew as mapCursorField,
    ITreeCursorSynchronous,
} from "../tree";
import { CursorAdapter, singleStackTreeCursor } from "./treeCursorUtils";

/**
 * This module provides support for reading and writing a human readable (and editable) tree format.
 *
 * This implementation can handle all trees (so it does not need a fallback for any special cases),
 * and is not optimized.
 *
 * It's suitable for testing and debugging,
 * though it could also reasonably be used as a fallback for edge cases or for small trees.
 *
 * TODO: Use placeholders.
 * build / add operations should be able to include detached ranges instead of children directly.
 * summaries should be able to reference unloaded chunks instead of having children directly.
 * Leverage placeholders in the types below to accomplish this.
 * Determine how this relates to Cursor: should cursor be generic over placeholder values?
 * (Could use them for errors to allow non erroring cursors?)
 *
 * Note:
 * Currently a lot of Tree's codebase is using json for serialization.
 * Because putting json strings inside json works poorly (adds lots of escaping),
 * for now this library actually outputs and inputs the Json compatible type JsonableTree
 * rather than actual strings.
 */

/**
 * @returns an {@link ITreeCursorSynchronous} for a single {@link JsonableTree}.
 */
export function singleTextCursor(root: JsonableTree): ITreeCursorSynchronous {
    return singleStackTreeCursor(root, adapter);
}

const adapter: CursorAdapter<JsonableTree> = {
    keysFromNode: genericTreeKeys,
    getFieldFromNode: (node, key): readonly JsonableTree[] => getGenericTreeField(node, key, false),
};

/**
 * Extract a JsonableTree from the contents of the given ITreeCursor's current node.
 */
export function jsonableTreeFromCursor(cursor: ITreeCursor): JsonableTree {
    assert(cursor.mode === CursorLocationType.Nodes, "must start at node");
    let fields: FieldMapObject<JsonableTree> | undefined;
    let inField = cursor.firstField();
    while (inField) {
        fields ??= {};
        const field: JsonableTree[] = mapCursorField(cursor, jsonableTreeFromCursor);
        fields[cursor.getFieldKey() as string] = field;
        inField = cursor.nextNode();
    }

    const node: JsonableTree = {
        type: cursor.type,
        value: cursor.value,
        fields,
    };
    // Normalize object by only including fields that are required.
    if (fields === undefined) {
        delete node.fields;
    }
    if (node.value === undefined) {
        delete node.value;
    }
    return node;
}
