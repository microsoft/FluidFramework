/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { IChannelStorageService } from "@fluidframework/datastore-definitions";
import { fromUtf8ToBase64 } from "@fluidframework/common-utils";
import { IBlob, ITree, TreeEntry } from "@fluidframework/protocol-definitions";
import { listBlobsAtTreePath } from "@fluidframework/runtime-utils";

export class LocalChannelStorageService implements IChannelStorageService {
    constructor(private readonly tree: ITree) {
    }

    public async read(path: string): Promise<string> {
        const contents = this.readSync(path);
        return contents !== undefined ? Promise.resolve(contents) : Promise.reject("Not found");
    }

    public async contains(path: string): Promise<boolean> {
        const contents = this.readSync(path);
        return contents !== undefined;
    }

    public async list(path: string): Promise<string[]> {
        return listBlobsAtTreePath(this.tree, path);
    }

    /**
     * Provides a synchronous access point to locally stored data
     */
    private readSync(path: string): string | undefined {
        return this.readSyncInternal(path, this.tree);
    }

    private readSyncInternal(path: string, tree: ITree): string | undefined {
        for (const entry of tree.entries) {
            switch (entry.type) {
                case TreeEntry.Blob:
                    if (path === entry.path) {
                        const blob = entry.value as IBlob;
                        return blob.encoding === "utf-8"
                            ? fromUtf8ToBase64(blob.contents)
                            : blob.contents;
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
