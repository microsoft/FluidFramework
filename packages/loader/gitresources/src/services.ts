import * as git from "./resources";

/**
 * Document header returned from the server
 */
export interface IHeader {
    // Tree representing all blobs in the snapshot
    tree: git.ITree;

    // Key blobs returned for performance. These include object headers and attribute files.
    blobs: git.IBlob[];
}
