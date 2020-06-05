/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import assert from "assert";
import { IBlob, ITree } from "@fluidframework/protocol-definitions";
import { IObjectStorageService } from "@fluidframework/component-runtime-definitions";
import { listBlobsAtTreePath } from "@fluidframework/runtime-utils";

/**
 * Mock implementation of IObjectStorageService based on ITree input.
 */
export class MockStorage implements IObjectStorageService {
    private static readCore(tree: ITree, paths: string[]): string {
        if (tree) {
            for (const entry of tree.entries) {
                if (entry.path === paths[0]) {
                    if (entry.type === "Blob") {
                        // eslint-disable-next-line prefer-rest-params
                        assert(paths.length === 1, JSON.stringify({ ...arguments }));
                        const blob = entry.value as IBlob;
                        return Buffer.from(blob.contents, blob.encoding)
                            .toString("base64");
                    }
                    if (entry.type === "Tree") {
                        return MockStorage.readCore(entry.value as ITree, paths.slice(1));
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
        const blob =  MockStorage.readCore(this.tree, path.split("/"));
        assert(blob !== undefined, `Blob does not exist: ${path}`);
        return blob;
    }

    public async contains(path: string): Promise<boolean> {
        return MockStorage.readCore(this.tree, path.split("/")) !== undefined;
    }

    public async list(path: string): Promise<string[]> {
        return listBlobsAtTreePath(this.tree, path);
    }
}
