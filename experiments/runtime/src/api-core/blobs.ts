import { ICreateBlobResponse } from "@prague/gitresources";

export interface IDataBlob {
    content?: Buffer;
    size: number;
    type: string;
    sha: string;
    fileName: string;
    url: string; // Link to durable URL
}

export interface IBlobManager {
    // Rehydrate a blob manager from a snapshot
    loadBlobMetadata(hashes: IDataBlob[]);

    // Get the metadata for all blobs on a document
    // Strip content if it exists
    getBlobMetadata(): IDataBlob[];

    // Retrieve the blob data
    getBlob(sha: string): Promise<IDataBlob>;

    // Add one blob's metadata to the local storage of blob metadata
    addBlob(blob: IDataBlob): Promise<void>;

    // Upload a blob to storage
    createBlob(file: Buffer): Promise<ICreateBlobResponse>;
}
