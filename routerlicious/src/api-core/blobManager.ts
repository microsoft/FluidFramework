import { ICreateBlobResponse } from "gitresources";
import * as api from "../api-core";

// TODO sabroner: Reimplement imageblob so it extends some baseblob type
export interface IImageBlob {
    content?: Buffer;
    fileName?: string;
    size?: number;
    sha: string;
    height: number;
    type: string;
    width: number;
    caption: string;
}

export interface IBlobManager {

    // Rehydrate a blob manager from a snapshot
    loadBlobMetadata(hashes: IImageBlob[]);

    // Get the metadata for all blobs on a document
    // Strip content if it exists
    getBlobMetadata(): IImageBlob[];

    // Retrieve the blob data
    getBlob(sha: string): Promise<IImageBlob>;

    // Add one blob's metadata
    addBlob(blob: IImageBlob): Promise<void>;

    // Upload a blob to storage
    createBlob(file: Buffer): Promise<ICreateBlobResponse>;
}

export class BlobManager implements IBlobManager {

    private blobs: Map<string, IImageBlob>;

    constructor(private storage: api.IDocumentStorageService) {
        this.blobs = new Map<string, IImageBlob>();
    }

    public async loadBlobMetadata(hashes: IImageBlob[]) {
        for (const hash of hashes) {
            this.blobs.set(hash.sha, hash);
        }
    }

    public getBlobMetadata(): IImageBlob[] {
        const blobs = [... this.blobs.values()];
        const arr =  blobs.map((value) => {
            value.content = null;
            return value;
        });
        return arr;
    }

    public async getBlob(sha: string): Promise<IImageBlob> {
        return new Promise<IImageBlob>((resolve, reject) => {

            this.storage.read(sha)
                .then((blobString) => {
                    // Could this cause memory issues?
                    // Probably not, this code only stores images specifically requested by the client
                    const blobContent = new Buffer(blobString, "base64");
                    const blob = this.blobs.get(sha);
                    blob.content = blobContent;
                    this.blobs.set(sha, blob);
                    resolve(blob);
                })
                .catch((error) => {
                    reject(error);
                });
        });
    }

    // TODO: sabroner add blob<t> where t is the inclusion types we add...
    public async addBlob(blob: IImageBlob): Promise<void> {
        if (blob.content !== null || blob.content !== undefined) {
            blob.content = null;
        }
        this.blobs.set(blob.sha, blob);
    }

    public async createBlob(file: Buffer): Promise<ICreateBlobResponse> {
        return this.storage.createBlob(file);
    }
}
