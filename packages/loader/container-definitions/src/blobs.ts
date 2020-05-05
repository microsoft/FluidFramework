/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

export interface IBlobManager {
    // Rehydrate a blob manager from a snapshot
    loadBlobMetadata(blobs: IGenericBlob[]): void;

    // Get the metadata for all blobs on a document
    // Strip content if it exists
    getBlobMetadata(): IGenericBlob[];

    // Retrieve the blob data
    getBlob(blobId: string): Promise<IGenericBlob | undefined>;

    // Add one blob's metadata to the local storage of blob metadata
    addBlob(blob: IGenericBlob): Promise<void>;

    // Upload a blob to storage
    createBlob(blob: IGenericBlob): Promise<IGenericBlob>;

    // Update blob metadata
    updateBlob(blob: IGenericBlob): Promise<void | null>;

    // Remove blob from storage
    removeBlob(blobId: string): Promise<void>;
}

export type IGenericBlob = IDataBlob | IImageBlob | IVideoBlob;

export interface IBaseBlob {
    content: Buffer;
    id: string;
    size: number;
    fileName: string;
    url: string; // Link to durable URL
}

export interface IDataBlob extends IBaseBlob {
    type: "generic";
}

export interface IImageBlob extends IBaseBlob {
    type: "image";
    height: number;
    width: number;
}

export interface IVideoBlob extends IBaseBlob {
    type: "video";
    height: number;
    width: number;
    length: number;
}

export function getFileBlobType(mimeType: string) {
    switch (mimeType) {
        case "image/jpeg":
        case "image/png":
        case "image/gif":
        case "image/bmp": {
            return "image";
        }
        case "video/mp4": {
            return "video";
        }
        case "text/plain": {
            return "text";
        }
        default: {
            return "generic";
        }
    }
}
