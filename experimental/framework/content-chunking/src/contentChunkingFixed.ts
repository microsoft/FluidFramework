/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */
import { IContentChunker } from "./contentChunkingInterfaces";

/**
 * Implementation class for the fixed size chunker
 */
export class FixedSizeContentChunker implements IContentChunker {
    chunkSize: number;
    constructor(chunkSize: number) {
        this.chunkSize = chunkSize;
    }
    public computeChunks(buffer: Uint8Array): Uint8Array[] {
        const blocks: Uint8Array[] = [];
        for (let pos = 0, i = 0; pos < buffer.byteLength; pos += this.chunkSize, i++) {
            const bytes: Uint8Array = buffer.slice(pos, pos + this.chunkSize);
            blocks.push(bytes);
        }
        return blocks;
    }
}
