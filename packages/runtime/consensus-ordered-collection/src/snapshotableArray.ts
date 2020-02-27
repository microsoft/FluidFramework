/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import * as assert from "assert";
import { fromBase64ToUtf8 } from "@microsoft/fluid-common-utils";
import { FileMode, ITree, TreeEntry } from "@microsoft/fluid-protocol-definitions";
import { IComponentRuntime, IObjectStorageService } from "@microsoft/fluid-runtime-definitions";
import { SharedObject, ValueType } from "@microsoft/fluid-shared-object-base";
import { IConsensusOrderedCollectionValue } from "./values";

/**
 * Consensus collection snapshot definition
 */
const snapshotFileName = "header";

export class SnapshotableArray<T> extends Array {
    protected readonly data: T[] = [];
    public snapshot(): ITree {
        // Get a serializable form of data
        const content: IConsensusOrderedCollectionValue[] = [];
        for (const item of this.data) {
            if (SharedObject.is(item)) {
                content.push({
                    type: ValueType[ValueType.Shared],
                    value: item.id, // (this.data as ISharedObject).id,
                });
            } else {
                content.push({
                    type: ValueType[ValueType.Plain],
                    value: item,
                });
            }
        }

        // And then construct the tree for it
        const tree: ITree = {
            entries: [
                {
                    mode: FileMode.File,
                    path: snapshotFileName,
                    type: TreeEntry[TreeEntry.Blob],
                    value: {
                        contents: JSON.stringify(content),
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
            const values = JSON.parse(fromBase64ToUtf8(rawContent)) as IConsensusOrderedCollectionValue[];

            for (const item of values) {
                switch (item.type) {
                    case ValueType[ValueType.Plain]:
                        // Assuming type T
                        this.data.push(item.value as T);
                        break;
                    case ValueType[ValueType.Shared]:
                        const channel = await runtime.getChannel(item.value as string);
                        // Assuming type T
                        this.data.push(channel as unknown as T);
                        break;
                    default:
                        assert(false, "Invalid value type");
                }
            }
        }
    }

    public size(): number {
        return this.data.length;
    }
}
