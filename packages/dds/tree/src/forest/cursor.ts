/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { Serializable } from "@fluidframework/datastore-definitions";
import { FieldKey, TreeType } from "../tree";

export const enum TreeNavigationResult {
    /** Attempt to navigate cursor to a key or index that is outside the client's view. */
    NotFound = -1,

    /** Attempt to navigate cursor to a portion of the tree that has not yet been loaded. */
    Pending = 0,

    /** ITreeReader successfully navigated to the desired node. */
    Ok = 1,
}

/**
 * Value stored on a node.
 *
 * TODO: `Serializable` is not really the right type to use here,
 * since may types (including functions) are "Serializable" (according to the type) despite not being serializable.
 *
 * Use this type instead of directly using Serializable for both clarity and so the above TODO can be addressed.
 */
export type Value = undefined | Serializable;

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
export interface ITreeCursor {
    /** Select the child located at the given key and index. */
    down(key: FieldKey, index: number): TreeNavigationResult;

    /**
     * Moves `offset` entries in the field.
     * May move less if Pending or NotFound.
     * In this case the distance moved is returned, and may be less than `offset`.
     * Iff `ok` then `moved` will equal `offset`.
     */
    seek(offset: number): { result: TreeNavigationResult; moved: number; };

    /** Select the parent of the currently selected node. */
    up(): TreeNavigationResult;

    /** The type of the currently selected node. */
    readonly type: TreeType;

    /**
     * @returns the keys of the currently selected node.
     * TODO: ordering invariants: Consistent over time? Consistent across nodes? Sorted?
     * TODO: empty fields: are they always omitted here? Sometimes omitted? Depends on field kind and schema?
     * */
    keys: Iterable<FieldKey>;

    /** @returns the number of immediate children for the given key of the currently selected node. */
    length(key: FieldKey): number;

    /** value associated with the currently selected node. */
    readonly value: Value;
}
