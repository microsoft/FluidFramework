/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { IChannelStorageService } from "@fluidframework/datastore-definitions";
import { assert } from "@fluidframework/common-utils";
import { blobToString, toBuffer } from "@fluidframework/driver-utils";
import { IBlob, ITree, TreeEntry } from "@fluidframework/protocol-definitions";
import { listBlobsAtTreePath } from "@fluidframework/runtime-utils";

export class LocalChannelStorageService implements IChannelStorageService {
    constructor(private readonly tree: ITree) {
    }

    public async contains(path: string): Promise<boolean> {
        const blob = await this.readBlob(path);
        return blob !== undefined;
    }

    public async list(path: string): Promise<string[]> {
        return listBlobsAtTreePath(this.tree, path);
    }

    /**
     * Provides a synchronous access point to locally stored data
     */
    public async readBlob(path: string): Promise<ArrayBufferLike> {
        const blob = this.readSyncInternal(path, this.tree);
        assert(blob !== undefined, "Not Found");
        console.log(toBuffer("hello","utf8"));
        console.log(blobToString(toBuffer("hello","base64")));
        return toBuffer(blob.contents, blob.encoding);
    }

    private readSyncInternal(path: string, tree: ITree): IBlob | undefined {
        for (const entry of tree.entries) {
            switch (entry.type) {
                case TreeEntry.Blob:
                    if (path === entry.path) {
                        const blob = entry.value as IBlob;
                        return blob;
                    }
                    break;

                case TreeEntry.Tree:
                    if (path.startsWith(entry.path)) {
                        return this.readSyncInternal(path.substr(entry.path.length + 1), entry.value as ITree);
                    }
                    break;

                default:
            }
        }

        return undefined;
    }
}
