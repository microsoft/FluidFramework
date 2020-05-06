/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { IDocumentStorageService } from "@microsoft/fluid-driver-definitions";
import { DocumentStorageServiceProxy } from "@microsoft/fluid-driver-utils";

/**
 * IDocumentStorageService adapter with pre-cached blobs.
 */
export class BlobCacheStorageService extends DocumentStorageServiceProxy {
    private readonly blobs: Promise<Map<string, string>>;
    constructor(
        internalStorageService: IDocumentStorageService,
        blobs: Promise<Map<string, string>> | Map<string, string>,
    ) {
        super(internalStorageService);
        this.blobs = Promise.resolve(blobs);
    }

    public async read(id: string): Promise<string> {
        const blob = (await this.blobs).get(id);
        if (blob !== undefined) {
            return blob;
        }

        return this.internalStorageService.read(id);
    }
}
