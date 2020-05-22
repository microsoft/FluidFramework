/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { IDocumentStorageService } from "@fluidframework/driver-definitions";
import { DocumentStorageServiceProxy } from "@fluidframework/driver-utils";

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

    public async read(id: string): Promise<string> {
        const blob = this.blobs.get(id);
        if (blob !== undefined) {
            return blob;
        }

        return this.internalStorageService.read(id);
    }
}
