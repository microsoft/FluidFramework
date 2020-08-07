/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { Buffer } from "buffer";
import { IFluidHandle } from "@fluidframework/core-interfaces";

export interface IBlobManager {
    // Rehydrate a blob manager from a snapshot
    loadBlobHandles(blobIds: string[]): void;

    // Mark a blob as attached, preventing it from being garbage collected
    setAttached(blobId: string): void;

    // Get ids of all attached blobs
    getBlobIds(): string[];

    // Retrieve the blob data
    getBlob(blobId: string): Promise<IFluidHandle>;

    // Upload a blob to storage
    createBlob(blob: Buffer): Promise<IFluidHandle>;

    // Remove blob from storage
    removeBlob(blobId: string): Promise<void>;
}
