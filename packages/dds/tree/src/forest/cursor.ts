/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { assert } from "@fluidframework/common-utils";
import { FieldKey, TreeType, UpPath, Value } from "../tree";

/**
 * A stateful low-level interface for reading tree data.
 */
export interface ITreeCursor {
    /**
     * What kind of place the cursor is at.
     * Determines which operations are allowed.
     */
    readonly mode: CursorLocationType;
    /*
     * True iff the current field or node (depending on mode) is "pending",
     * meaning that it has not been downloaded.
     */
    readonly pending: boolean;

    /**
     * Moves the "current field" forward one in an arbitrary field traversal order.
     *
     * If there is no remaining field to iterate to,
     * returns false and navigates up to the parent setting the mode to `Nodes`.
     *
     * Order of fields only applies to this function,
     * and is only guaranteed to be consistent thorough a single iteration.
     *
     * If mode is `Nodes` enters the first field.
     *
     * If skipPending, skip past fields which are currently pending.
     * This can be used to skip to the end of a large number of consecutive pending fields.
     *
     * NOT allowed if mode is `Nodes` and also `pending`.
     *
     * TODO: consider splitting out a `firstField` method, or using a foreEachField method instead.
     */
    nextField(skipPending: boolean): boolean;

    /**
     * Moves `offset` nodes in the field.
     * If seeking to exactly past either end,
     * returns false and navigates up to the parent field (setting `inFields` to `true`).
     *
     * If mode is `Fields`, offset is from the corresponding end of the field.
     * For example, `-1` would seek to the last node and `1` would seek to the first.
     *
     * NOT allowed if mode is `Fields` and also `pending`.
     *
     * TODO: consider splitting out a `firstNode` method, or using a foreEachNode method instead.
     */
    seek(offset: number): boolean;

    // ********** APIs for when mode = Fields, and not pending ********** //

    /**
     * Returns the FieldKey for the current field.
     *
     * Allowed when `mode` is `Fields`, and not `pending`.
     */
    getCurrentFieldKey(): FieldKey;

    /**
     * @returns the number of immediate children in the current field.
     *
     * Allowed when `mode` is `Fields`, and not `pending`.
     */
    getCurrentFieldLength(): number;

    /**
     * Sets current node to the node at the provided `index` of the current field.
     *
     * Allowed when `mode` is `Fields`, and not `pending`.
     * Sets mode to `Nodes`.
     */
    enterChildNode(index: number): void;

    // ********** APIs for when mode = Nodes ********** //

    /**
     * @returns a path to the current node.
     *
     * Only valid when `mode` is `Nodes`.
     * Assumes root node is special node above detached sequences.
     */
    getPath(): UpPath | undefined;

    /**
     * Index (within its parent field) of the current node.
     *
     * Only valid when `mode` is `Nodes`.
     */
    readonly currentIndexInField: number;

    /**
     * Index (within its parent field) of the first node in the current chunk.
     * Always less than or equal to `currentIndexInField`.
     *
     * Only valid when `mode` is `Nodes`.
     */
    readonly currentChunkStart: number;

    /**
     * Length of current chunk.
     * Since an entire chunk always has the same `pending` value,
     * can be used to help skip over all of a pending chunk at once.
     *
     * TODO:
     * Add optional APIs to access underlying chunks so readers can
     * accelerate processing of chunk formats they understand.
     *
     * Only valid when `mode` is `Nodes`.
     */
    readonly currentChunkLength: number;

    // ********** APIs for when mode = Nodes and not pending ********** //

    /**
     * Navigate to the field with the specified `key` and set the mode to `Fields`.
     */
    enterField(key: FieldKey): void;

    /**
     * Navigate up to parent node.
     * Sets mode to `Nodes`
     *
     * Only valid when `mode` is `Fields`.
     *
     * TODO: what to do if at root?
     */
    upToNode(): void;

    /**
     * Navigate up to parent field.
     * Sets mode to `Fields`
     *
     * Same as seek Number.POSITIVE_INFINITY, but only valid when `mode` is `Nodes`.
     *
     * TODO: what to do if at root?
     * TODO: Maybe merge with upToNode to make a single "Up"?
     */
    upToField(): void;

    /**
     * The type of the currently selected node.
     *
     * Only valid when `mode` is `Nodes`, and not `pending`.
     */
    readonly type: TreeType;

    /**
     * The value associated with the currently selected node.
     *
     * Only valid when `mode` is `Nodes`, and not `pending`.
     */
    readonly value: Value;
}

export const enum CursorLocationType {
    /**
     * Can iterate through nodes in a field.
     * At a "current node".
     */
    Nodes,

    /**
     * Can iterate through fields of a node.
     * At a "current field".
     */
    Fields,
}

export interface ITreeCursorSynchronous extends ITreeCursor{
    readonly pending: false;
}

/**
 * @param cursor - tree whose field will be visited.
 * @param f - builds output from field member, which will be selected in cursor when cursor is provided.
 *  If `f` moves cursor, it must put it back to where it was at the beginning of `f` before returning.
 * @returns array resulting from applying `f` to each item of the current field on `cursor`.
 * Returns an empty array if the field is empty or not present (which are considered the same).
 */
export function mapCursorField<T>(cursor: ITreeCursor, f: (cursor: ITreeCursor) => T): T[] {
    const output: T[] = [];
    assert(cursor.mode === CursorLocationType.Fields, "should be in fields");
    while (cursor.seek(1)) {
        output.push(f(cursor));
    }
    return output;
}

export function reduceField<T>(
    cursor: ITreeCursor, initial: T, f: (cursor: ITreeCursor, initial: T) => T): T {
    assert(cursor.mode === CursorLocationType.Fields, "should be in fields");
    let output: T = initial;
    while (cursor.seek(1)) {
        output = f(cursor, output);
    }
    return output;
}
