/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */
import { getNormalizedObjectStoragePathParts } from "@fluidframework/runtime-utils";
export class ChannelStorageService {
    constructor(tree, storage, extraBlobs) {
        this.tree = tree;
        this.storage = storage;
        this.extraBlobs = extraBlobs;
        // Create a map from paths to blobs
        if (tree !== undefined) {
            this.flattenedTreeP = tree.then((snapshotTree) => {
                const flattenedTree = {};
                ChannelStorageService.flattenTree("", snapshotTree, flattenedTree);
                return flattenedTree;
            });
        }
        else {
            this.flattenedTreeP = Promise.resolve({});
        }
    }
    static flattenTree(base, tree, results) {
        // eslint-disable-next-line guard-for-in, no-restricted-syntax
        for (const path in tree.trees) {
            ChannelStorageService.flattenTree(`${base}${path}/`, tree.trees[path], results);
        }
        // eslint-disable-next-line guard-for-in, no-restricted-syntax
        for (const blob in tree.blobs) {
            results[`${base}${blob}`] = tree.blobs[blob];
        }
    }
    async contains(path) {
        return (await this.flattenedTreeP)[path] !== undefined;
    }
    async read(path) {
        const id = await this.getIdForPath(path);
        const blob = this.extraBlobs !== undefined
            ? (await this.extraBlobs).get(id)
            : undefined;
        return (blob !== null && blob !== void 0 ? blob : this.storage.read(id));
    }
    async list(path) {
        var _a, _b;
        let tree = await this.tree;
        const pathParts = getNormalizedObjectStoragePathParts(path);
        while (tree !== undefined && pathParts.length > 0) {
            // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
            const part = pathParts.shift();
            tree = tree.trees[part];
        }
        if (tree === undefined || pathParts.length !== 0) {
            throw new Error("path does not exist");
        }
        return Object.keys((_b = (_a = tree) === null || _a === void 0 ? void 0 : _a.blobs, (_b !== null && _b !== void 0 ? _b : {})));
    }
    async getIdForPath(path) {
        return (await this.flattenedTreeP)[path];
    }
}
//# sourceMappingURL=channelStorageService.js.map