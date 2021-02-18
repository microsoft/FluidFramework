/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { stringToBuffer } from "@fluidframework/common-utils";
import { IDocumentStorageService } from "@fluidframework/driver-definitions";
import { DocumentStorageServiceProxy } from "./documentStorageServiceProxy";

/**
 * IDocumentStorageService adapter with pre-cached blobs.
 */
export class BlobCacheStorageService extends DocumentStorageServiceProxy {
    constructor(
        internalStorageService: IDocumentStorageService,
        private readonly blobs: Map<string, string>,
    ) {
        super(internalStorageService);
    }

    public get policies() {
        return this.internalStorageService.policies;
    }

    public async read(id: string): Promise<string> {
        const blob = this.blobs.get(id);
        if (blob !== undefined) {
            return blob;
        }

        return this.internalStorageService.read(id);
    }

    public async readBlob(id: string): Promise<ArrayBufferLike> {
        const blob = this.blobs.get(id);
        if (blob !== undefined) {
            return stringToBuffer(blob, "base64");
        }

        return this.internalStorageService.readBlob(id);
    }
}
