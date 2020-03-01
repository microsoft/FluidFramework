/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import * as assert from "assert";
import { fromBase64ToUtf8 } from "@microsoft/fluid-common-utils";
import { FileMode, ITree, TreeEntry } from "@microsoft/fluid-protocol-definitions";
import { IComponentRuntime, IObjectStorageService } from "@microsoft/fluid-runtime-definitions";

/**
 * Consensus collection snapshot definition
 */
const snapshotFileName = "header";

export class SnapshotableArray<T> extends Array {
    protected data: T[] = [];
    public snapshot(): ITree {
        // And then construct the tree for it
        const tree: ITree = {
            entries: [
                {
                    mode: FileMode.File,
                    path: snapshotFileName,
                    type: TreeEntry[TreeEntry.Blob],
                    value: {
                        contents: JSON.stringify(this.data),
                        encoding: "utf-8",
                    },
                },
            ],
            // eslint-disable-next-line no-null/no-null
            id: null,
        };

        return tree;
    }

    public async load(
        runtime: IComponentRuntime,
        storage: IObjectStorageService): Promise<void> {

        assert(this.data.length === 0, "Loading snapshot into a non-empty collection");
        const rawContent = await storage.read(snapshotFileName);

        if (rawContent) {
            this.data = JSON.parse(fromBase64ToUtf8(rawContent)) as T[];
        }
    }

    public size(): number {
        return this.data.length;
    }
}
