/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { assert } from "@fluidframework/common-utils";
import { FieldKey, TreeType, Value } from "../tree";

export const enum TreeNavigationResult {
    /**
     * Attempt to navigate cursor to a key or index that is outside the client's view.
     */
    NotFound = -1,

    /**
     * Attempt to navigate cursor to a portion of the tree that has not yet been loaded.
     */
    Pending = 0,

    /**
     * ITreeReader successfully navigated to the desired node.
     */
    Ok = 1,
}

/**
 * TreeNavigationResult, but never "Pending".
 * Can be used when data is never pending.
 */
export type SynchronousNavigationResult = TreeNavigationResult.Ok | TreeNavigationResult.NotFound;

/**
 * A stateful low-level interface for reading tree data.
 *
 * TODO: Needs rules around invalidation/mutation of the underlying tree.
 * Should either be documented here, or each producer should document them
 * (and likely via returning a sub-interface with documentation on the subject).
 *
 * TODO: Needs a way to efficiently clone Cursor so patterns like lazy tree reification can be implemented efficiently.
 *
 * TODO: add optional fast path APIs for more efficient handling when supported by underlying format and reader.
 * Leverage "chunks" and "shape" for this, and skip to next chunk with seek (chunk length).
 * Default chunks of size 1, and "node" shape?
 */
export interface ITreeCursor<TResult = TreeNavigationResult> {
    /**
     * Select the child located at the given key and index.
     */
    down(key: FieldKey, index: number): TResult;

    /**
     * Moves `offset` entries in the field.
     */
    seek(offset: number): TResult;

    /**
     * Select the parent of the currently selected node.
     */
    up(): TResult;

    /**
     * The type of the currently selected node.
     */
    readonly type: TreeType;

    /**
     * @returns the keys of the currently selected node.
     * TODO: ordering invariants: Consistent over time? Consistent across nodes? Sorted?
     * TODO: empty fields: are they always omitted here? Sometimes omitted? Depends on field kind and schema?
     * */
    keys: Iterable<FieldKey>;

    /**
     * @returns the number of immediate children for the given key of the currently selected node.
     */
    length(key: FieldKey): number;

    /**
     * value associated with the currently selected node.
     */
    readonly value: Value;
}

/**
 * @param cursor - tree whose field will be visited.
 * @param key - the field to visit.
 * @param f - builds output from field member, which will be selected in cursor when cursor is provided.
 * If `f` moves cursor, it must put it back to where it was at the beginning of `f` before returning.
 * @returns array resulting from applying `f` to each item of field `key` on `cursor`'s current node.
 * Returns an empty array if the field is empty or not present (which are considered the same).
 */
export function mapCursorField<T, TCursor extends ITreeCursor = ITreeCursor>(
    cursor: TCursor,
    key: FieldKey,
    f: (cursor: TCursor) => T,
): T[] {
    const output: T[] = [];
    let result = cursor.down(key, 0);
    if (result !== TreeNavigationResult.Ok) {
        assert(
            result === TreeNavigationResult.NotFound,
            0x34e /* pending not supported in mapCursorField */,
        );
        // This has to be special cased (and not fall through the code below)
        // since the call to `up` needs to be skipped.
        return [];
    }
    while (result === TreeNavigationResult.Ok) {
        output.push(f(cursor));
        result = cursor.seek(1);
    }
    assert(
        result === TreeNavigationResult.NotFound,
        0x34f /* expected enumeration to end at end of field */,
    );
    cursor.up();
    return output;
}

export function reduceField<T>(
    cursor: ITreeCursor,
    key: FieldKey,
    initial: T,
    f: (cursor: ITreeCursor, initial: T) => T,
): T {
    let output: T = initial;
    let result = cursor.down(key, 0);
    if (result !== TreeNavigationResult.Ok) {
        assert(
            result === TreeNavigationResult.NotFound,
            0x3bb /* pending not supported in reduceField */,
        );
        // This has to be special cased (and not fall through the code below)
        // since the call to `up` needs to be skipped.
        return output;
    }
    while (result === TreeNavigationResult.Ok) {
        output = f(cursor, output);
        result = cursor.seek(1);
    }
    assert(
        result === TreeNavigationResult.NotFound,
        0x3bc /* expected enumeration to end at end of field */,
    );
    cursor.up();
    return output;
}
