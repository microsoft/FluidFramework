/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { assert , IsoBuffer, stringToBuffer } from "@fluidframework/common-utils";
import { ISummaryTree, ITree } from "@fluidframework/protocol-definitions";
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

    private static readCore(tree: ITree, paths: string[]): string {
        if (tree) {
            for (const entry of tree.entries) {
                if (entry.path === paths[0]) {
                    if (entry.type === "Blob") {
                        // eslint-disable-next-line prefer-rest-params
                        assert(paths.length === 1, JSON.stringify({ ...arguments }));
                        const blob = entry.value;
                        return IsoBuffer.from(blob.contents, blob.encoding)
                            .toString("base64");
                    }
                    if (entry.type === "Tree") {
                        return MockStorage.readCore(entry.value, paths.slice(1));
                    }
                    return undefined;
                }
            }
            return undefined;
        }
    }

    private static readBlobCore(tree: ITree, paths: string[]): IBlob {
        if (tree) {
            for (const entry of tree.entries) {
                if (entry.path === paths[0]) {
                    if (entry.type === "Blob") {
                        // eslint-disable-next-line prefer-rest-params
                        assert(paths.length === 1, JSON.stringify({ ...arguments }));
                        return entry.value as IBlob;
                    }
                    if (entry.type === "Tree") {
                        return MockStorage.readBlobCore(entry.value as ITree, paths.slice(1));
                    }
                    return undefined;
                }
            }
            return undefined;
        }
    }

    constructor(protected tree?: ITree) {
    }

    public async read(path: string): Promise<string> {
        const blob = MockStorage.readCore(this.tree, path.split("/"));
        assert(blob !== undefined, `Blob does not exist: ${path}`);
        return blob;
    }

    public async readBlob(path: string): Promise<ArrayBufferLike> {
        const blob = MockStorage.readBlobCore(this.tree, path.split("/"));
        assert(blob !== undefined, `Blob does not exist: ${path}`);
        return stringToBuffer(blob.contents, blob.encoding);
    }

    public async contains(path: string): Promise<boolean> {
        return MockStorage.readCore(this.tree, path.split("/")) !== undefined;
    }

    public async list(path: string): Promise<string[]> {
        return listBlobsAtTreePath(this.tree, path);
    }
}
