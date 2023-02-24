/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { BasicChunk, BasicChunkCursor } from "./basicChunk";
import { ChunkedCursor, dummyRoot, ReferenceCountedBase, TreeChunk } from "./chunk";

/**
 * General purpose multi-node sequence chunk.
 */
export class SequenceChunk extends ReferenceCountedBase implements TreeChunk {
    public get topLevelLength(): number {
        let total = 0;
        for (const child of this.subChunks) {
            total += child.topLevelLength;
        }
        return total;
    }

    /**
     * Create a tree chunk with ref count 1.
     *
     * @param fields - provides exclusive deep ownership of this map to this object (which might mutate it in the future).
     * The caller must have already accounted for this reference to the children in this map (via `referenceAdded`),
     * and any edits to this must update child reference counts.
     * @param value - the value on this node, if any.
     */
    public constructor(public readonly subChunks: TreeChunk[]) {
        super();
    }

    public clone(): SequenceChunk {
        const subChunks = this.subChunks.map((child) => {
            child.referenceAdded();
            return child;
        });
        return new SequenceChunk(subChunks);
    }

    public cursor(): ChunkedCursor {
        return new BasicChunkCursor(
            // TODO: remove this cast
            this.subChunks as BasicChunk[],
            [],
            [],
            [],
            [],
            [dummyRoot],
            0,
            0,
            0,
        );
    }

    protected dispose(): void {
        for (const child of this.subChunks) {
            child.referenceRemoved();
        }
    }
}
