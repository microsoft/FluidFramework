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
    cursor(): ITreeCursorSynchronous;
}

/**
 * Base class to assist with implementing ReferenceCounted
 */
export class ReferenceCountedBase implements ReferenceCounted {
    private refCount: number = 1;

    public referenceAdded(): void {
        this.refCount++;
    }

    public referenceRemoved(): void {
        this.refCount--;
        assert(this.refCount >= 0, "Negative ref count");
    }

    public isShared(): boolean {
        return this.refCount > 1;
    }
}

export const dummyRoot: GlobalFieldKeySymbol = symbolFromKey(
    brand("a1499167-8421-4639-90a6-4e543b113b06: dummyRoot"),
);

/**
 * A symbol for extracting a TreeChunk from {@link ITreeCursor}.
 */
export const cursorChunk: unique symbol = Symbol("cursorChunk");

interface WithChunk {
    [cursorChunk]?: TreeChunk;
}

export function tryGetChunk(cursor: ITreeCursor): undefined | TreeChunk {
    return (cursor as WithChunk)[cursorChunk];
}
