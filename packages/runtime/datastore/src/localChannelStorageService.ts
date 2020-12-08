/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { IChannelStorageService } from "@fluidframework/datastore-definitions";
import { assert, fromBase64ToUtf8, fromUtf8ToBase64 } from "@fluidframework/common-utils";
import { IBlob, ITree, TreeEntry } from "@fluidframework/protocol-definitions";
import { listBlobsAtTreePath } from "@fluidframework/runtime-utils";

export class LocalChannelStorageService implements IChannelStorageService {
    constructor(private readonly tree: ITree) {
    }

    public async read(path: string): Promise<string> {
        const blob = await this.readBlob(path);
        assert(blob !== undefined, "Not Found");
        assert(blob.contents !== undefined, "Not Found");
        if (blob.encoding === "base64") {
            return blob.contents;
        }
        return fromUtf8ToBase64(blob.contents);
    }

    public async readString(path: string): Promise<string> {
        const blob = await this.readBlob(path);
        assert(blob !== undefined, "Not Found");
        assert(blob.contents !== undefined, "Not Found");
        if (blob.encoding === "base64") {
            return fromBase64ToUtf8(blob.contents);
        }
        return blob.contents;
    }

    public async contains(path: string): Promise<boolean> {
        const blob = await this.readBlob(path);
        assert(blob !== undefined, "Not Found");
        return blob.contents !== undefined;
    }

    public async list(path: string): Promise<string[]> {
        return listBlobsAtTreePath(this.tree, path);
    }

    /**
     * Provides a synchronous access point to locally stored data
     */
    public async readBlob(path: string): Promise<IBlob> {
        const blob = this.readSyncInternal(path, this.tree);
        assert(blob !== undefined, "Not Found");
        return blob;
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
