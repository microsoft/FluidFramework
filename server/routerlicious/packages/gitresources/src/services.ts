/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { IBlob, ITree } from "./resources";

/**
 * Document header returned from the server
 * This is not a GIT specific interface but specific to Historian
 */
export interface IHeader {
    // Tree representing all blobs in the snapshot
    tree: ITree;

    // Key blobs returned for performance. These include object headers and attribute files.
    blobs: IBlob[];
}
