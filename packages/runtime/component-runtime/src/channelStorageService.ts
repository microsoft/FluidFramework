/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { IDocumentStorageService } from "@fluidframework/driver-definitions";
import { ISnapshotTree } from "@fluidframework/protocol-definitions";
import { IObjectStorageService } from "@fluidframework/component-runtime-definitions";
import { getNormalizedObjectStoragePathParts } from "@fluidframework/runtime-utils";

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

    private readonly flattenedTreeP: Promise<{ [path: string]: string }>;

    constructor(
        private readonly tree: Promise<ISnapshotTree> | undefined,
        private readonly storage: Pick<IDocumentStorageService, "read">,
        private readonly extraBlobs?: Promise<Map<string, string>>,
    ) {
        // Create a map from paths to blobs
        if (tree !== undefined) {
            this.flattenedTreeP = tree.then((snapshotTree) => {
                const flattenedTree: { [path: string]: string } = {};
                ChannelStorageService.flattenTree("", snapshotTree, flattenedTree);
                return flattenedTree;
            });
        } else {
            this.flattenedTreeP = Promise.resolve({});
        }
    }

    public async contains(path: string): Promise<boolean> {
        return (await this.flattenedTreeP)[path] !== undefined;
    }

    public async read(path: string): Promise<string> {
        const id = await this.getIdForPath(path);
        const blob = this.extraBlobs !== undefined
            ? (await this.extraBlobs).get(id)
            : undefined;

        return blob ?? this.storage.read(id);
    }

    public async list(path: string): Promise<string[]> {
        let tree = await this.tree;
        const pathParts = getNormalizedObjectStoragePathParts(path);
        while (tree !== undefined && pathParts.length > 0) {
            // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
            const part = pathParts.shift()!;
            tree = tree.trees[part];
        }
        if (tree === undefined || pathParts.length !== 0) {
            throw new Error("path does not exist");
        }

        return Object.keys(tree?.blobs ?? {});
    }

    private async getIdForPath(path: string): Promise<string> {
        return (await this.flattenedTreeP)[path];
    }
}
