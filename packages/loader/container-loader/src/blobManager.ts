/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { IBlobManager, IGenericBlob } from "@fluidframework/container-definitions";
import { IDocumentStorageService } from "@fluidframework/driver-definitions";

export class BlobManager implements IBlobManager {
    private readonly blobs: Map<string, IGenericBlob>;

    constructor(private readonly storage: IDocumentStorageService) {
        this.blobs = new Map<string, IGenericBlob>();
    }

    public loadBlobMetadata(blobs: IGenericBlob[]) {
        for (const blob of blobs) {
            this.blobs.set(blob.id, blob);
        }
    }

    public getBlobMetadata(): IGenericBlob[] {
        const blobs = [... this.blobs.values()];
        return blobs.map((value) => value);
    }

    public async getBlob(blobId: string): Promise<IGenericBlob | undefined> {
        if (!this.blobs.has(blobId)) {
            return Promise.reject("Blob does not exist");
        }

        const blob = this.blobs.get(blobId);
        const blobContent = await this.storage.read(blobId);
        if (blobContent === undefined) {
            return undefined;
        }
        blob!.content = Buffer.from(blobContent, "base64");
        return blob;
    }

    public async addBlob(blob: IGenericBlob): Promise<void> {
        this.blobs.set(blob.id, blob);
    }

    public async createBlob(blob: IGenericBlob): Promise<IGenericBlob> {
        const response = await this.storage.createBlob(blob.content);

        // Remove blobContent
        // eslint-disable-next-line @typescript-eslint/consistent-type-assertions
        const blobMetaData = {
            fileName: blob.fileName,
            id: response.id,
            size: blob.size,
            type: blob.type,
            url: response.url,
        } as IGenericBlob;
        this.blobs.set(blobMetaData.id, blobMetaData);
        return blobMetaData;
    }

    public async updateBlob(blob: IGenericBlob): Promise<void | null> {
        // TODO: Issue-2170 Implement updateBlob and removeBlob
        return null;
    }

    public async removeBlob(blobId: string): Promise<void> {
        // TODO: Issue-2170 Implement updateBlob and removeBlob
        this.blobs.delete(blobId);
    }
}
