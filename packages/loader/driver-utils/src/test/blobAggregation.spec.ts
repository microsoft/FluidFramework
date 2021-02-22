/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { IDocumentStorageService } from "@fluidframework/driver-definitions";
import { assert, TelemetryNullLogger, stringToBuffer, bufferToString } from "@fluidframework/common-utils";
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

    public async read(path: string): Promise<string> {
        const id = this.flattenedTree[path];
        return bufferToString(await this.storage.readBlob(id), "utf-8");
    }
}

class InMemoryStorage {
    private summaryWritten: ISummaryTree | undefined;
    public readonly blobs = new Map<string, string>();

    public get policies() {
        return { minBlobSize: this.blobSizeLimit };
    }

    constructor(private readonly blobSizeLimit: number | undefined) {}

    async uploadSummaryWithContext(summary: ISummaryTree, context) {
        assert(!this.summaryWritten);
        this.summaryWritten = summary;
        return "handle";
    }

    async getSnapshotTree(version) {
        assert(this.summaryWritten !== undefined);
        return buildSnapshotTree(convertSummaryTreeToITree(this.summaryWritten).entries, this.blobs);
    }

    async readBlob(id: string) {
        const blob = this.blobs.get(id);
        if (blob !== undefined) {
            return stringToBuffer(blob, "base64");
        }

        throw new Error("unknown blob id");
    }
}

const summaryTree: ISummaryTree = {
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
        // Aggregation is per data store. This data store tests that its blobs would not be aggregated
        dataStore2: {
            type: SummaryType.Tree,
            tree: {
                channel2: {
                    type: SummaryType.Tree,
                    tree: {
                        blob5: {
                            type: SummaryType.Blob,
                            content: "small string 2",
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
        allowPacking);

    await aggregator.uploadSummaryWithContext(summaryTree, {
        proposalHandle: undefined,
        ackHandle: undefined,
        referenceSequenceNumber: 5,
    });

    const snapshot = await aggregator.getSnapshotTree();
    assert(!!snapshot);

    const service = new FlattenedStorageService(snapshot, aggregator);
    assert(Object.keys(service.flattenedTree).length === 5);
    assert (service.flattenedTree.blob1 !== undefined);
    assert (service.flattenedTree["dataStore1/blob2"] !== undefined);
    assert (service.flattenedTree["dataStore1/blob3"] !== undefined);
    assert (service.flattenedTree["dataStore1/channel1/blob4"] !== undefined);
    assert (service.flattenedTree["dataStore2/channel2/blob5"] !== undefined);

    assert(await service.read("dataStore1/blob2") === "small string 2");
    assert(await service.read("dataStore1/blob3") === "not very small string - exceeding 40 bytes limit for sure");
    assert(await service.read("dataStore1/channel1/blob4") === "small string again");

    return { service, storage, snapshot};
}

describe("BlobAggregationStorage", () => {
    it("no aggregation", async () => {
        const { storage } = await prep(false, 2048);

        // NUmber of actual blobs in storage should be 4 - no aggregation!
        assert(storage.blobs.size === 5);
    });

    it("Noop aggregation (driver does not know about aggregation", async () => {
        const { storage } = await prep(true, undefined);

        // NUmber of actual blobs in storage should be 4 - no aggregation!
        assert(storage.blobs.size === 5);
    });

    it("aggregation above 2K", async () => {
        const { storage } = await prep(true, 2048);

        // Number of actual blobs in storage should be 2!
        assert(storage.blobs.size === 3);
    });

    it("aggregation above 40 bytes only", async () => {
        const { storage } = await prep(true, 40);

        // Should skip one blob that is bigger than 40 bytes.
        assert(storage.blobs.size === 4);
    });
});
