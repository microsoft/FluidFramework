/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import {
    ITreeCursor,
    TreeNavigationResult,
    mapCursorField,
    SynchronousNavigationResult,
} from "../forest";
import {
    FieldKey,
    FieldMap,
    getGenericTreeField,
    getGenericTreeFieldMap,
    JsonableTree,
    TreeType,
    Value,
} from "../tree";
import { fail } from "../util";

/**
 * This modules provides support for reading and writing a human readable (and editable) tree format.
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
 * An ITreeCursor implementation for JsonableTree.
 *
 * TODO: object-forest's cursor is mostly a superset of this functionality.
 * Maybe do a refactoring to deduplicate this.
 */
export class TextCursor implements ITreeCursor<SynchronousNavigationResult> {
    // Indices traversed to visit this node: does not include current level (which is stored in `index`).
    private readonly indexStack: number[] = [];
    // Siblings into which indexStack indexes: does not include current level (which is stored in `siblings`).
    private readonly siblingStack: JsonableTree[][] = [];

    private siblings: JsonableTree[];
    private index: number;

    public constructor(root: JsonableTree) {
        this.index = 0;
        this.siblings = [root];
    }

    private getNode(): JsonableTree {
        return this.siblings[this.index];
    }

    get value(): Value {
        return this.getNode().value;
    }

    get type(): TreeType {
        return this.getNode().type;
    }

    get keys(): Iterable<FieldKey> {
        return Object.getOwnPropertyNames(getGenericTreeFieldMap(this.getNode(), false)) as Iterable<FieldKey>;
    }

    down(key: FieldKey, index: number): SynchronousNavigationResult {
        const siblings = getGenericTreeField(this.getNode(), key, false);
        const child = siblings[index];
        if (child !== undefined) {
            this.indexStack.push(this.index);
            this.siblingStack.push(this.siblings);
            this.siblings = siblings;
            this.index = index;
            return TreeNavigationResult.Ok;
        }
        return TreeNavigationResult.NotFound;
    }

    seek(offset: number): SynchronousNavigationResult {
        const index = offset + this.index;
        const child = this.siblings[index];
        if (child !== undefined) {
            this.index = index;
            return TreeNavigationResult.Ok;
        }
        return TreeNavigationResult.NotFound;
    }

    up(): SynchronousNavigationResult {
        const index = this.indexStack.pop();
        if (index === undefined) {
            // At root already (and made no changes to current location)
            return TreeNavigationResult.NotFound;
        }

        this.index = index;
        this.siblings = this.siblingStack.pop() ?? fail("Unexpected siblingStack.length");
        return TreeNavigationResult.Ok;
    }

    length(key: FieldKey): number {
        return getGenericTreeField(this.getNode(), key, false).length;
    }
}

/**
 * Extract a JsonableTree from the contents of the given ITreeCursor's current node.
 */
export function jsonableTreeFromCursor(cursor: ITreeCursor): JsonableTree {
    let fields: FieldMap<JsonableTree> | undefined;
    for (const key of cursor.keys) {
        fields ??= {};
        const field: JsonableTree[] = mapCursorField(cursor, key, jsonableTreeFromCursor);
        fields[key as string] = field;
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
