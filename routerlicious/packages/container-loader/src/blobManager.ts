import { IBlobManager, IDocumentStorageService, IGenericBlob } from "@prague/container-definitions";

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

    public getBlobMetadata(): IGenericBlob[] {
        const blobs = [... this.blobs.values()];
        return blobs.map((value) => {
            value.content = null;
            return value;
        });
    }

    public async getBlob(sha: string): Promise<IGenericBlob> {

        if (!this.blobs.has(sha)) {
            // tslint:disable-next-line:no-floating-promises
            Promise.reject("Blob does not exist");
        }
        const blob = this.blobs.get(sha);
        const blobContent = await this.storage.read(sha);
        blob.content = new Buffer(blobContent, "base64");
        return blob;
    }

    public async addBlob(blob: IGenericBlob): Promise<void> {
        this.blobs.set(blob.sha, blob);
    }

    public async createBlob(blob: IGenericBlob): Promise<IGenericBlob> {
        await this.storage.createBlob(blob.content);

        /* tslint:disable:no-object-literal-type-assertion */
        // Remove blobContent
        const blobMetaData = {
            fileName: blob.fileName,
            sha: blob.sha,
            size: blob.size,
            type: blob.type,
            url: blob.url,
        } as IGenericBlob;
        this.blobs.set(blob.sha, blobMetaData);
        return blobMetaData;
    }

    public async updateBlob(blob: IGenericBlob): Promise<void> {
        // TODO: SABRONER Implement Update
        return null;
    }

    public async removeBlob(sha: string): Promise<void> {
        // TODO: SABRONER implement removal
        this.blobs.delete(sha);
    }
}
