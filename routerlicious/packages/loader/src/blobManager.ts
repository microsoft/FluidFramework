import { IBlobManager, IDocumentStorageService, IGenericBlob } from "@prague/runtime-definitions";

export class BlobManager implements IBlobManager {
    private blobs: Map<string, IGenericBlob>;

    constructor(private storage: IDocumentStorageService) {
        this.blobs = new Map<string, IGenericBlob>();
    }

    public async loadBlobMetadata(hashes: IGenericBlob[]) {
        try {
            for (const hash of hashes) {
                this.blobs.set(hash.sha, hash);
            }
        } catch (error) {
            console.log("Error in Blob Snapshot Load");
        }
    }

    public getBlobMetadata(): Promise<IGenericBlob[]> {
        const blobs = [... this.blobs.values()];
        return Promise.resolve(blobs.map((value) => {
            value.content = null;
            return value;
        }));
    }

    public async getBlob(sha: string): Promise<IGenericBlob> {
        return new Promise<IGenericBlob>((resolve, reject) => {
            let blob: IGenericBlob = null;

            blob = this.blobs.get(sha);
            if (blob !== null && blob.content !== null ) {
                resolve(blob);
            }

            this.storage.read(sha)
                .then((blobString) => {
                    // Could this cause memory issues?
                    // Probably not, this code only stores images specifically requested by the client
                    const blobContent = new Buffer(blobString, "base64");
                    blob.content = blobContent;
                    resolve(blob);
                })
                .catch((error) => {
                    reject(error);
                });
        });
    }

    public async addBlob(blob: IGenericBlob): Promise<void> {
        this.blobs.set(blob.sha, blob);
    }

    public async createBlob(blob: IGenericBlob): Promise<IGenericBlob> {
        return new Promise<IGenericBlob>((resolve, reject) => {
            this.storage.createBlob(blob.content)
                .then((response) => {
                    // Remove blobContent
                    this.blobs.set(blob.sha, blob);
                    const blobMetaData = {
                        fileName: blob.fileName,
                        sha: blob.sha,
                        size: blob.size,
                        type: blob.type,
                        url: blob.url,
                    } as IGenericBlob;
                    resolve(blobMetaData);
                })
                .catch((reason) => {
                    reject(reason);
                });
        });
    }

    public async updateBlob(blob: IGenericBlob): Promise<void> {
        return null;
    }

    public async removeBlob(sha: string): Promise<void> {
        // TODO: SABRONER implement removal
        this.blobs.delete(sha);
    }
}
