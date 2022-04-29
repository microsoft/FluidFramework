/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "assert";
import { IDocumentStorageService } from "@fluidframework/driver-definitions";
import { TelemetryNullLogger, bufferToString } from "@fluidframework/common-utils";
import { ISummaryTree, SummaryType, ISnapshotTree } from "@fluidframework/protocol-definitions";
import { convertSummaryTreeToITree } from "@fluidframework/runtime-utils";
import { BlobAggregationStorage } from "../blobAggregationStorage";
import { buildSnapshotTree } from "../buildSnapshotTree";

export class FlattenedStorageService {
    private static flattenTree(base: string, tree: ISnapshotTree, results: { [path: string]: string }) {
        // eslint-disable-next-line guard-for-in, no-restricted-syntax
        for (const path in tree.trees) {
            FlattenedStorageService.flattenTree(`${base}${path}/`, tree.trees[path], results);
        }

        // eslint-disable-next-line guard-for-in, no-restricted-syntax
        for (const blob in tree.blobs) {
            results[`${base}${blob}`] = tree.blobs[blob];
        }
    }

    public readonly flattenedTree: { [path: string]: string } = {};

    constructor(
        tree: ISnapshotTree,
        private readonly storage: Pick<IDocumentStorageService, "readBlob">,
    ) {
        FlattenedStorageService.flattenTree("", tree, this.flattenedTree);
    }

    public async readBlob(path: string): Promise<ArrayBufferLike> {
        const id = this.flattenedTree[path];
        return this.storage.readBlob(id);
    }
}

class InMemoryStorage {
    private summaryWritten: ISummaryTree | undefined;
    public readonly blobs = new Map<string, ArrayBufferLike>();

    public get policies() {
        return { minBlobSize: this.blobSizeLimit };
    }

    constructor(private readonly blobSizeLimit: number | undefined) {}

    async uploadSummaryWithContext(summary: ISummaryTree, context) {
        assert(!this.summaryWritten, "Trying to upload summary when summary already written!");
        this.summaryWritten = summary;
        return "handle";
    }

    async getSnapshotTree(version) {
        assert(this.summaryWritten !== undefined, "Missing summary to build tree from");
        return buildSnapshotTree(convertSummaryTreeToITree(this.summaryWritten).entries, this.blobs);
    }

    async readBlob(id: string) {
        const blob = this.blobs.get(id);
        assert(blob !== undefined, "unknown blob id");
        return blob;
    }
}

const summaryTree: ISummaryTree = {
    type: SummaryType.Tree,
    tree: {
        ".channels": {
            type: SummaryType.Tree,
            tree: {
                // Blob in root is not aggregated
                blob1: {
                    type: SummaryType.Blob,
                    content: "small string",
                },
                // Aggregation is per data store. This data store tests what blobs (2 or 3) would get aggregated
                dataStore1: {
                    type: SummaryType.Tree,
                    tree: {
                        ".channels": {
                            type: SummaryType.Tree,
                            tree: {
                                blob2: {
                                    type: SummaryType.Blob,
                                    content: "small string 2",
                                },
                                blob3: {
                                    type: SummaryType.Blob,
                                    content: "not very small string - exceeding 40 bytes limit for sure",
                                },
                                channel1: {
                                    type: SummaryType.Tree,
                                    tree: {
                                        blob4: {
                                            type: SummaryType.Blob,
                                            content: "small string again",
                                        },
                                    },
                                },
                            },
                        },
                        ".component": {
                            type: SummaryType.Blob,
                            content: "component blob for dataStore1",
                        },
                    },
                },
                // Aggregation is per data store. This data store tests that its blobs would not be aggregated
                dataStore2: {
                    type: SummaryType.Tree,
                    tree: {
                        ".channels": {
                            type: SummaryType.Tree,
                            tree: {
                                blob5: {
                                    type: SummaryType.Blob,
                                    content: "small string 2",
                                },
                            },
                        },
                        ".component": {
                            type: SummaryType.Blob,
                            content: "component blob for dataStore2",
                        },
                    },
                },
            },
        },
    },
};

async function prep(allowPacking: boolean, blobSizeLimit: number | undefined) {
    const storage = new InMemoryStorage(blobSizeLimit);

    const aggregator = BlobAggregationStorage.wrap(
        storage as any as IDocumentStorageService,
        new TelemetryNullLogger(),
        allowPacking,
        2);

    await aggregator.uploadSummaryWithContext(summaryTree, {
        proposalHandle: undefined,
        ackHandle: undefined,
        referenceSequenceNumber: 5,
    });

    const snapshot = await aggregator.getSnapshotTree();
    assert(!!snapshot, "Missing snapshot tree!");

    const service = new FlattenedStorageService(snapshot, aggregator);
    assert(Object.keys(service.flattenedTree).length === 7,
        `Unexpected flattened tree size: ${Object.keys(service.flattenedTree).length}`);
    assert(service.flattenedTree[".channels/blob1"] !== undefined);
    assert(service.flattenedTree[".channels/dataStore1/.channels/blob2"] !== undefined);
    assert(service.flattenedTree[".channels/dataStore1/.channels/blob3"] !== undefined);
    assert(service.flattenedTree[".channels/dataStore1/.channels/channel1/blob4"] !== undefined);
    assert(service.flattenedTree[".channels/dataStore2/.channels/blob5"] !== undefined);

    assert(bufferToString(await service.readBlob(".channels/dataStore1/.channels/blob2"), "utf8")
        === "small string 2", "blob2 failed");
    assert(bufferToString(await service.readBlob(".channels/dataStore1/.channels/blob3"), "utf8")
        === "not very small string - exceeding 40 bytes limit for sure", "blob3 failed");
    assert(bufferToString(await service.readBlob(".channels/dataStore1/.channels/channel1/blob4"),
        "utf8") === "small string again", "blob4 failed");

    return { service, storage, snapshot };
}

describe("BlobAggregationStorage", () => {
    it("no aggregation", async () => {
        const { storage } = await prep(false, 2048);

        // Number of actual blobs in storage should be 7 - no aggregation!
        assert(storage.blobs.size === 7,
            `Unexpected blob storage size: ${storage.blobs.size} vs expected 7`);
    });

    it("Noop aggregation (driver does not know about aggregation", async () => {
        const { storage } = await prep(true, undefined);

        // Number of actual blobs in storage should be 7 - no aggregation!
        assert(storage.blobs.size === 7,
            `Unexpected blob storage size: ${storage.blobs.size} vs expected 7`);
    });

    it("aggregation above 2K", async () => {
        const { storage } = await prep(true, 2048);

        // Number of actual blobs in storage should be 2!
        assert(storage.blobs.size === 3,
            `Unexpected blob storage size: ${storage.blobs.size} vs expected 3`);
    });

    it("aggregation above 40 bytes only", async () => {
        const { storage } = await prep(true, 40);

        // Should skip one blob that is bigger than 40 bytes.
        assert(storage.blobs.size === 4,
            `Unexpected blob storage size: ${storage.blobs.size} vs expected 4`);
    });
});
