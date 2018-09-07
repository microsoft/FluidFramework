import { ICreateBlobResponse } from "@prague/gitresources";
import { IDocumentStorageService } from "@prague/runtime-definitions";
import * as api from "../api-core";

export interface IBlobManager {

    // Rehydrate a blob manager from a snapshot
    loadBlobMetadata(hashes: api.IGenericBlob[]);

    // Get the metadata for all blobs on a document
    // Strip content if it exists
    getBlobMetadata(): Promise<api.IGenericBlob[]>;

    // Retrieve the blob data
    getBlob(sha: string): Promise<api.IGenericBlob>;

    // Add one blob's metadata to the local storage of blob metadata
    addBlob(blob: api.IGenericBlob): Promise<void>;

    // Upload a blob to storage
    createBlob(file: Buffer): Promise<ICreateBlobResponse>;
}

export class BlobManager implements IBlobManager {

    private blobs: Map<string, api.IGenericBlob>;

    constructor(private storage: IDocumentStorageService) {
        this.blobs = new Map<string, api.IGenericBlob>();
    }

    public async loadBlobMetadata(hashes: api.IGenericBlob[]) {
        for (const hash of hashes) {
            this.blobs.set(hash.sha, hash);
        }
    }

    public getBlobMetadata(): Promise<api.IGenericBlob[]> {
        const blobs = [... this.blobs.values()];
        return Promise.resolve(blobs.map((value) => {
            value.content = null;
            return value;
        }));
    }

    public async getBlob(sha: string): Promise<api.IGenericBlob> {
        return new Promise<api.IGenericBlob>((resolve, reject) => {
            if (this.blobs.has(sha) && this.blobs.get(sha).content !== null) {
                const blob = this.blobs.get(sha);
                if (blob.content.byteLength > 0) {
                    resolve(blob);
                }
            }

            this.storage.read(sha)
                .then((blobString) => {
                    // Could this cause memory issues?
                    // Probably not, this code only stores images specifically requested by the client
                    const blobContent = new Buffer(blobString, "base64");
                    const blob = this.blobs.get(sha);
                    blob.content = blobContent;
                    blob.url = this.storage.getRawUrl(sha);
                    this.blobs.set(sha, blob);
                    resolve(blob);
                })
                .catch((error) => {
                    reject(error);
                });
        });
    }

    // TODO: sabroner add blob<t> where t is the inclusion types we add...
    public async addBlob(blob: api.IGenericBlob): Promise<void> {
        if (blob.content !== null || blob.content !== undefined) {
            blob.content = null;
        }
        this.blobs.set(blob.sha, blob);
    }

    public async createBlob(file: Buffer): Promise<ICreateBlobResponse> {
        return this.storage.createBlob(file);
    }
}
