/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { ComponentRuntime } from "@prague/component-runtime";
import { IBlobManager, IDocumentStorageService, IGenericBlob, IRequest } from "@prague/container-definitions";
import { MapExtension } from "@prague/map";
import { IComponentContext, IComponentRuntime } from "@prague/runtime-definitions";

// const blobMetaData = this.blobManager!.getBlobMetadata();
// entries[".blobs"] = {
//     content: JSON.stringify(blobMetaData),
//     type: SummaryType.Blob,
// };

// const blobMetaData = this.blobManager!.getBlobMetadata();
// entries.push({
//     mode: FileMode.File,
//     path: ".blobs",
//     type: TreeEntry[TreeEntry.Blob],
//     value: {
//         contents: JSON.stringify(blobMetaData),
//         encoding: "utf-8",
//     },
// });

// private async loadBlobManager(storage: IDocumentStorageService, tree: ISnapshotTree): Promise<BlobManager> {
//     const blobs: IGenericBlob[] = tree
//         ? await readAndParse<IGenericBlob[]>(storage, tree.blobs[".blobs"]!)
//         : [];

//     const blobManager = new BlobManager(storage);
//     // tslint:disable-next-line:no-floating-promises
//     blobManager.loadBlobMetadata(blobs);

//     return blobManager;
// }

// case MessageType.BlobUploaded:
//     // tslint:disable-next-line:no-floating-promises
//     this.blobManager!.addBlob(message.contents);
//     this.emit(MessageType.BlobUploaded, message.contents);
//     break;

export class BlobManager implements IBlobManager {
    private readonly blobs: Map<string, IGenericBlob>;

    constructor(private readonly storage: IDocumentStorageService) {
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
            return value;
        });
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
        blob.content = Buffer.from(blobContent, "base64");
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

/**
 * Instantiates a new chaincode component
 */
export async function instantiateComponent(context: IComponentContext): Promise<IComponentRuntime> {
    const modules = new Map<string, any>();

    // Create channel extensions
    const mapExtension = new MapExtension();
    modules.set(MapExtension.Type, mapExtension);

    // TODO custom blob specific runtime
    const runtime = await ComponentRuntime.load(context, modules);

    runtime.registerRequestHandler(async (request: IRequest) => {
        return { status: 404, mimeType: "text/plain", value: `${request.url} not found` };
    });

    return runtime;
}
