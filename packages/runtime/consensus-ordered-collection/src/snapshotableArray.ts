import { SharedObject } from "@prague/api-definitions";
import {
    FileMode,
    ITree,
    TreeEntry,
} from "@prague/container-definitions";
import { IComponentRuntime, IObjectStorageService } from "@prague/runtime-definitions";
import * as assert from "assert";
import { ConsensusValueType, IConsensusOrderedCollectionValue } from "./values";

/**
 * Consensus collection snapshot definition
 */
const snapshotFileName = "header";

export class SnapshotableArray<T> extends Array {
    protected readonly data = new Array<T>();
    public snapshot(): ITree {
        // Get a serializable form of data
        const content = new Array<IConsensusOrderedCollectionValue>();
        for (const item of this.data) {
            if (item instanceof SharedObject) {
                content.push({
                    type: ConsensusValueType[ConsensusValueType.Shared],
                    value: item.id, // (this.data as ISharedObject).id,
                });
            } else {
                content.push({
                    type: ConsensusValueType[ConsensusValueType.Plain],
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
            sha: null,
        };

        return tree;
    }

    public async load(
        runtime: IComponentRuntime,
        storage: IObjectStorageService): Promise<void> {

        assert(this.data.length === 0, "Loading snapshot into a non-empty collection");
        const rawContent = await storage.read(snapshotFileName);

        // tslint:disable-next-line:strict-boolean-expressions
        if (rawContent) {
            const values = JSON.parse(Buffer.from(rawContent, "base64")
                .toString("utf-8")) as IConsensusOrderedCollectionValue[];

            for (const item of values) {
                switch (item.type) {
                    case ConsensusValueType[ConsensusValueType.Plain]:
                        // assuming type T
                        this.data.push(item.value as T);
                        break;
                    case ConsensusValueType[ConsensusValueType.Shared]:
                        const channel = await runtime.getChannel(item.value as string);
                        // assuming type T
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
