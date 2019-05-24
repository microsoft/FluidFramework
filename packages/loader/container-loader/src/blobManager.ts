import { IBlobManager, IDocumentStorageService, IGenericBlob } from "@prague/container-definitions";

export class BlobManager implements IBlobManager {
    private blobs: Map<string, IGenericBlob>;

    constructor(private storage: IDocumentStorageService) {
        this.blobs = new Map<string, IGenericBlob>();
    }

    public async loadBlobMetadata(blobs: IGenericBlob[]) {
        try {
            for (const blob of blobs) {
                this.blobs.set(blob.id, blob);
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

    public async getBlob(blobId: string): Promise<IGenericBlob | undefined> {

        if (!this.blobs.has(blobId)) {
            // tslint:disable-next-line:no-floating-promises
            Promise.reject("Blob does not exist");
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

        /* tslint:disable:no-object-literal-type-assertion */
        // Remove blobContent
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
