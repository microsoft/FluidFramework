/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { assert } from "@fluidframework/common-utils";
import {
    GlobalFieldKeySymbol,
    ITreeCursor,
    ITreeCursorSynchronous,
    symbolFromKey,
} from "../../core";
import { brand } from "../../util";

export interface ReferenceCounted {
    referenceAdded(): void;

    referenceRemoved(): void;

    isShared(): boolean;
}

/**
 * Contiguous part of the tree which get stored together in some data format.
 * Copy-on-write, but optimized to be mutated in place when a chunk only has a single user (detected using reference counting).
 * This allows for efficient cloning of without major performance overheads for non-cloning scenarios.
 */
export interface TreeChunk extends ReferenceCounted {
    readonly topLevelLength: number;
    cursor(): ChunkedCursor;
}

/**
 * Base class to assist with implementing ReferenceCounted
 */
export abstract class ReferenceCountedBase implements ReferenceCounted {
    private refCount: number = 1;

    public referenceAdded(): void {
        this.refCount++;
    }

    public referenceRemoved(): void {
        this.refCount--;
        assert(this.refCount >= 0, "Negative ref count");
        if (this.refCount === 0) {
            this.dispose();
        }
    }

    public isShared(): boolean {
        return this.refCount > 1;
    }

    /**
     * Called when refcount reaches 0.
     */
    protected abstract dispose(): void;
}

export const dummyRoot: GlobalFieldKeySymbol = symbolFromKey(
    brand("a1499167-8421-4639-90a6-4e543b113b06: dummyRoot"),
);

/**
 * A symbol for extracting a TreeChunk from {@link ITreeCursor}.
 */
export const cursorChunk: unique symbol = Symbol("cursorChunk");

/**
 * Cursors can optionally implement this interface, allowing querying them for the chunk they are traversing.
 */
interface WithChunk {
    /**
     * When in nodes mode, if a value is returned, it is a TreeChunk who's top level nodes are the
     * chunkLength nodes starting from chunkStart.
     *
     * Note that there may be other tree representations which different chunk APS and thus different ways to query them.
     * The chunkStart and chunkLength values thus to not uniquely apply to the chunks accessed through this field.
     */
    readonly [cursorChunk]?: TreeChunk;
}

export function tryGetChunk(cursor: ITreeCursor): undefined | TreeChunk {
    return (cursor as WithChunk)[cursorChunk];
}

export interface ChunkedCursor extends ITreeCursorSynchronous, WithChunk {
    readonly [cursorChunk]?: TreeChunk;
}
