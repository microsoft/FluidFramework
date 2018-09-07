import { ICreateBlobResponse } from "@prague/gitresources";
import { IBlobManager, IDocumentStorageService, IGenericBlob } from "@prague/runtime-definitions";
import * as sha1 from "sha.js/sha1";

/**
 * Create Hash (Github hashes the string with blob and size)
 * @param file The contents of the file in a buffer
 */
export function gitHashFile(file: Buffer): string {
    const size = file.byteLength;
    const filePrefix = "blob " + size + "\0";
    const engine = new sha1();
    return engine.update(filePrefix).update(file).digest("hex");
}

export class BlobManager implements IBlobManager {
    private blobs: Map<string, IGenericBlob>;

    constructor(private storage: IDocumentStorageService) {
        this.blobs = new Map<string, IGenericBlob>();
    }

    public async loadBlobMetadata(hashes: IGenericBlob[]) {
        for (const hash of hashes) {
            this.blobs.set(hash.sha, hash);
        }
    }

    public getBlobMetadata(): IGenericBlob[] {
        const blobs = [... this.blobs.values()];
        const arr =  blobs.map((value) => {
            value.content = null;
            return value;
        });
        return arr;
    }

    public async getBlob(sha: string): Promise<IGenericBlob> {
        return new Promise<IGenericBlob>((resolve, reject) => {
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
    public async addBlob(blob: IGenericBlob): Promise<void> {
        if (blob.content !== null || blob.content !== undefined) {
            blob.content = null;
        }
        this.blobs.set(blob.sha, blob);
    }

    public async createBlob(file: Buffer): Promise<ICreateBlobResponse> {
        return this.storage.createBlob(file);
    }
}
