/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { IChannelStorageService } from "@fluidframework/datastore-definitions";
import { fromBase64ToUtf8, stringToBuffer } from "@fluidframework/common-utils";
import { IBlob, ITree, TreeEntry } from "@fluidframework/protocol-definitions";
import { listBlobsAtTreePath } from "@fluidframework/runtime-utils";

export class LocalChannelStorageService implements IChannelStorageService {
    constructor(private readonly tree: ITree) {
    }

    public async read(path: string): Promise<string> {
        const blob = this.readBlobSync(path);
        if (blob === undefined) {
            throw new Error("Blob Not Found");
        }
        if (blob.encoding === "utf8") {
            return blob.contents;
        }
        return fromBase64ToUtf8(blob.contents);
    }

    public async readBlob(path: string): Promise<ArrayBufferLike> {
        const blob = this.readBlobSync(path);
        if (blob === undefined) {
            throw new Error("Blob Not Found");
        }
        return stringToBuffer(blob.contents, blob.encoding);
    }

    public async contains(path: string): Promise<boolean> {
        const blob = this.readBlobSync(path);
        return blob !== undefined ? blob.contents !== undefined : false;
    }

    public async list(path: string): Promise<string[]> {
        return listBlobsAtTreePath(this.tree, path);
    }

    private readBlobSync(path: string): IBlob | undefined {
        return this.readBlobSyncInternal(path, this.tree);
    }

    private readBlobSyncInternal(path: string, tree: ITree): IBlob | undefined {
        for (const entry of tree.entries) {
            switch (entry.type) {
                case TreeEntry.Blob:
                    if (path === entry.path) {
                        return entry.value;
                    }
                    break;

                case TreeEntry.Tree:
                    if (path.startsWith(entry.path)) {
                        return this.readBlobSyncInternal(path.substr(entry.path.length + 1), entry.value);
                    }
                    break;

                default:
            }
        }

        return undefined;
    }
}
