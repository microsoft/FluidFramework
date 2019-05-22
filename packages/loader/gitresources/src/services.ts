import { IBlob, ITree } from "./resources";

/**
 * Document header returned from the server
 */
export interface IHeader {
    // Tree representing all blobs in the snapshot
    tree: ITree;

    // Key blobs returned for performance. These include object headers and attribute files.
    blobs: IBlob[];
}
