/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { assert } from "@fluidframework/common-utils";
import {
    ITreeCursor,
    TreeNavigationResult,
    mapCursorField,
    SynchronousNavigationResult,
} from "../forest";
import {
    DetachedField,
    detachedFieldAsKey,
    FieldKey,
    genericTreeKeys,
    getGenericTreeField,
    JsonableTree,
    setGenericTreeField,
    TreeType,
    UpPath,
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
 * @returns a TextCursor for a single JsonableTree.
 */
export function singleTextCursor(root: JsonableTree): TextCursor {
    return new TextCursor([root], 0);
}

/**
 * An ITreeCursor implementation for JsonableTree.
 *
 * TODO: object-forest's cursor is mostly a superset of this functionality.
 * Maybe do a refactoring to deduplicate this.
 */
export class TextCursor implements ITreeCursor<SynchronousNavigationResult> {
    // Indices traversed to visit this node: does not include current level (which is stored in `index`).
    protected readonly indexStack: number[] = [];
    // Siblings into which indexStack indexes: does not include current level (which is stored in `siblings`).
    protected readonly siblingStack: JsonableTree[][] = [];
    // Keys traversed to visit this node, including detached field at the beginning if there is one.
    protected readonly keyStack: FieldKey[] = [];

    protected siblings: JsonableTree[];
    protected index: number;

    public constructor(root: JsonableTree[], index: number, field?: DetachedField) {
        this.index = index;
        this.siblings = root;
        if (field) {
            this.keyStack.push(detachedFieldAsKey(field));
        }
    }

    /**
     * @returns true iff this cursor is rooted in a detached field.
     */
    public isRooted(): boolean {
        return this.keyStack.length === this.siblingStack.length + 1;
    }

    protected getNode(): JsonableTree {
        return this.siblings[this.index];
    }

    get value(): Value {
        return this.getNode().value;
    }

    get type(): TreeType {
        return this.getNode().type;
    }

    get keys(): Iterable<FieldKey> {
        return genericTreeKeys(this.getNode());
    }

    down(key: FieldKey, index: number): SynchronousNavigationResult {
        const siblings = getGenericTreeField(this.getNode(), key, false);
        const child = siblings[index];
        if (child !== undefined) {
            this.indexStack.push(this.index);
            this.siblingStack.push(this.siblings);
            this.keyStack.push(key);
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
        this.keyStack.pop();
        return TreeNavigationResult.Ok;
    }

    length(key: FieldKey): number {
        return getGenericTreeField(this.getNode(), key, false).length;
    }
}

/**
 * TextCursor for a tree that is rooted in a DetachedField.
 * Like with {@link UpPath} the highest key in the tree is the {@link DetachedField}.
 */
export class RootedTextCursor extends TextCursor {
    public constructor(root: JsonableTree[], index: number, field: DetachedField) {
        super(root, index, field);
    }

    getParentFieldKey(): FieldKey {
        return this.keyStack[this.keyStack.length - 1];
    }

    getPath(): UpPath {
        // Perf Note:
        // This is O(depth) in tree.
        // If many different anchors are created, this could be optimized to amortize the costs.
        // For example, the cursor could cache UpPaths from the anchorSet when creating an anchor,
        // then reuse them as a starting point when making another.
        // Could cache this at one depth, and remember the depth.
        // When navigating up, adjust cached anchor if present.

        let path: UpPath | undefined;
        const length = this.indexStack.length;
        assert(this.siblingStack.length === length, 0x34c /* Unexpected siblingStack.length */);
        assert(this.keyStack.length === length + 1, 0x34d /* Unexpected keyStack.length */);
        for (let height = 0; height < length; height++) {
            path = {
                parent: path,
                parentIndex: this.indexStack[height],
                parentField: this.keyStack[height],
            };
        }
        path = {
            parent: path,
            parentIndex: this.index,
            parentField: this.keyStack[length],
        };
        return path;
    }
}

/**
 * Extract a JsonableTree from the contents of the given ITreeCursor's current node.
 */
export function jsonableTreeFromCursor(cursor: ITreeCursor): JsonableTree {
    const node: JsonableTree = {
        type: cursor.type,
    };
    // Normalize object by only including fields that are required.
    if (cursor.value !== undefined) {
        node.value = cursor.value;
    }
    for (const key of cursor.keys) {
        const field: JsonableTree[] = mapCursorField(cursor, key, jsonableTreeFromCursor);
        setGenericTreeField(node, key, field);
    }
    return node;
}
