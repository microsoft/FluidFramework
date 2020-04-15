/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { IDocumentStorageService } from "@microsoft/fluid-driver-definitions";
import { ISnapshotTree } from "@microsoft/fluid-protocol-definitions";
import { IObjectStorageService } from "@microsoft/fluid-runtime-definitions";

export class ChannelStorageService implements IObjectStorageService {
    private static flattenTree(base: string, tree: ISnapshotTree, results: { [path: string]: string }) {
        // eslint-disable-next-line guard-for-in, no-restricted-syntax
        for (const path in tree.trees) {
            ChannelStorageService.flattenTree(`${base}${path}/`, tree.trees[path], results);
        }

        // eslint-disable-next-line guard-for-in, no-restricted-syntax
        for (const blob in tree.blobs) {
            results[`${base}${blob}`] = tree.blobs[blob];
        }
    }

    private readonly flattenedTree: { [path: string]: string } = {};

    constructor(
        tree: ISnapshotTree | undefined,
        public readonly storageGetter: () => IDocumentStorageService,
        private readonly extraBlobs?: Map<string, string>,
    ) {
        // Create a map from paths to blobs
        if (tree) {
            ChannelStorageService.flattenTree("", tree, this.flattenedTree);
        }
    }

    public contains(path: string){
        return this.flattenedTree[path] !== undefined;
    }

    // eslint-disable-next-line @typescript-eslint/promise-function-async
    public read(path: string): Promise<string> {
        const id = this.getIdForPath(path);

        return this.extraBlobs && this.extraBlobs.has(id)
            // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
            ? Promise.resolve(this.extraBlobs.get(id)!)
            : this.storageGetter().read(id);
    }

    private getIdForPath(path: string): string {
        return this.flattenedTree[path];
    }
}
