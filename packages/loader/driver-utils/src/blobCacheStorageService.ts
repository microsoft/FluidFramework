/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { assert } from "@fluidframework/common-utils";
import { IDocumentStorageService } from "@fluidframework/driver-definitions";
import { toBuffer } from "./toBuffer";
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

    public async readBlob(id: string): Promise<ArrayBufferLike> {
        const blob = this.blobs.get(id);
        assert(blob !== undefined, "blob is undefined");
        return toBuffer(blob, "base64");
    }
}
