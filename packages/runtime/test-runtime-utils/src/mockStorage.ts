/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { assert , fromBase64ToUtf8, fromUtf8ToBase64 } from "@fluidframework/common-utils";
import { IBlob, ISummaryTree, ITree } from "@fluidframework/protocol-definitions";
import { IChannelStorageService } from "@fluidframework/datastore-definitions";
import { convertSummaryTreeToITree, listBlobsAtTreePath } from "@fluidframework/runtime-utils";

/**
 * Mock implementation of IChannelStorageService based on ITree input.
 */
export class MockStorage implements IChannelStorageService {
    public static createFromSummary(summaryTree: ISummaryTree) {
        const tree = convertSummaryTreeToITree(summaryTree);
        return new MockStorage(tree);
    }

    public async readBlob(path: string): Promise<ArrayBufferLike> {
        return this.readBlobInternal(this.tree, path.split("/"));
    }

    constructor(protected tree?: ITree) {
    }

    public async read(path: string): Promise<string> {
        const blob = await this.readBlob(path);
        assert(blob !== undefined, `Blob does not exist: ${path}`);
        if (blob.encoding === "base64") {
            return blob.contents;
        }
        return fromUtf8ToBase64(blob.contents);
    }

    public async contains(path: string): Promise<boolean> {
        return await this.readBlob(path) !== undefined;
    }

    public async list(path: string): Promise<string[]> {
        return listBlobsAtTreePath(this.tree, path);
    }

    private async readBlobInternal(tree: ITree, paths: string[]): Promise<IBlob> {
        if (tree) {
            for (const entry of tree.entries) {
                if (entry.path === paths[0]) {
                    if (entry.type === "Blob") {
                        // eslint-disable-next-line prefer-rest-params
                        assert(paths.length === 1, JSON.stringify({ ...arguments }));
                        const blob = entry.value as IBlob;
                        return blob;
                    }
                    if (entry.type === "Tree") {
                        return this.readBlobInternal(entry.value as ITree, paths.slice(1));
                    }
                    return undefined;
                }
            }
            return undefined;
        }
    }
}
