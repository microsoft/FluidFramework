/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */
import { fromUtf8ToBase64 } from "@fluidframework/common-utils";
import { TreeEntry } from "@fluidframework/protocol-definitions";
import { listBlobsAtTreePath } from "@fluidframework/runtime-utils";
export class LocalChannelStorageService {
    constructor(tree) {
        this.tree = tree;
    }
    async read(path) {
        const contents = this.readSync(path);
        return contents !== undefined ? Promise.resolve(contents) : Promise.reject("Not found");
    }
    async contains(path) {
        const contents = this.readSync(path);
        return contents !== undefined;
    }
    async list(path) {
        return listBlobsAtTreePath(this.tree, path);
    }
    /**
     * Provides a synchronous access point to locally stored data
     */
    readSync(path) {
        return this.readSyncInternal(path, this.tree);
    }
    readSyncInternal(path, tree) {
        for (const entry of tree.entries) {
            switch (entry.type) {
                case TreeEntry[TreeEntry.Blob]:
                    if (path === entry.path) {
                        const blob = entry.value;
                        return blob.encoding === "utf-8"
                            ? fromUtf8ToBase64(blob.contents)
                            : blob.contents;
                    }
                    break;
                case TreeEntry[TreeEntry.Tree]:
                    if (path.startsWith(entry.path)) {
                        return this.readSyncInternal(path.substr(entry.path.length + 1), entry.value);
                    }
                    break;
                default:
            }
        }
        return undefined;
    }
}
//# sourceMappingURL=localChannelStorageService.js.map