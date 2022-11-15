/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */
/* eslint-disable max-len */

import assert from "assert";
import { DebugLogger } from "@fluidframework/telemetry-utils";
import {
    SummaryType,
    ISummaryTree,
} from "@fluidframework/protocol-definitions";
import {
    IWholeFlatSummary,
    IWholeFlatSummaryBlob,
    IWholeFlatSummaryTreeEntry,
} from "@fluidframework/server-services-client";
import { WholeSummaryDocumentStorageService } from "../wholeSummaryDocumentStorageService";

/* Blobs contained within source summary tree returned by git manager */
const summaryBlobs: IWholeFlatSummaryBlob[] = [
    {
        id: "bARCTBK4PQiMLVK2gR5hPRkId",
        content: "[]",
        encoding: "utf-8",
        size: 2,
    },
    {
        id: "bARCfbIYtOyFwf1+nY75C4UFc",
        content: "{\"createContainerRuntimeVersion\":\"0.59.1000\",\"createContainerTimestamp\":1651351060440,\"summaryFormatVersion\":1,\"gcFeature\":0}",
        encoding: "utf-8",
        size: 125,
    },
    {
        id: "bARAL2CXvHYOch_aQtJAJOker",
        content: "[[\"code\",{\"key\":\"code\",\"value\":{\"package\":\"no-dynamic-package\",\"config\":{}},\"approvalSequenceNumber\":0,\"commitSequenceNumber\":0,\"sequenceNumber\":0}]]",
        encoding: "utf-8",
        size: 149,
    },
];

/* Tree entries contained within source summary tree returned by git manager */
const treeEntries: IWholeFlatSummaryTreeEntry[] = [
    {
        path: ".protocol",
        type: "tree",
    },
    {
        id: "bARCTBK4PQiMLVK2gR5hPRkId",
        path: ".protocol/attributes",
        type: "blob",
    },
    {
        id: "bARAL2CXvHYOch_aQtJAJOker",
        path: ".protocol/quorumValues",
        type: "blob",
    },
    {
        path: ".app",
        type: "tree",
    },
    {
        path: ".app/.channels",
        type: "tree",
    },
    {
        path: ".app/.channels/rootDOId",
        type: "tree",
    },
    {
        id: "bARCfbIYtOyFwf1+nY75C4UFc",
        path: ".app/.metadata",
        type: "blob",
    },
];

/* Source summary returned by git manager */
const flatSummary: IWholeFlatSummary = {
    id: "bBwAAAAAHAAAA",
    trees: [
        {
            id: "bBwAAAAAHAAAA",
            sequenceNumber: 0,
            entries: treeEntries,
        },
    ],
    blobs: summaryBlobs,
};

/* Expoected summary to be returned by downloadSummary */
const expectedSummary: ISummaryTree = {
    tree: {
        ".app": {
            tree: {
                ".channels": {
                    tree: {
                        rootDOId: {
                            tree: {},
                            type: 1,
                            unreferenced: undefined,
                        },
                    },
                    type: 1,
                    unreferenced: undefined,
                },
                ".metadata": {
                    content: "{\"createContainerRuntimeVersion\":\"0.59.1000\",\"createContainerTimestamp\":1651351060440,\"summaryFormatVersion\":1,\"gcFeature\":0}",
                    type: 2,
                },
            },
            type: 1,
            unreferenced: undefined,
        },
        ".protocol": {
            tree: {
                attributes: {
                    content: "[]",
                    type: 2,
                },
                quorumValues: {
                    content: "[[\"code\",{\"key\":\"code\",\"value\":{\"package\":\"no-dynamic-package\",\"config\":{}},\"approvalSequenceNumber\":0,\"commitSequenceNumber\":0,\"sequenceNumber\":0}]]",
                    type: 2,
                },
            },
            type: 1,
            unreferenced: undefined,
        },
    },
    type: 1,
    unreferenced: undefined,
};

class MockGitManager {
    public async getSummary(sha: string): Promise<IWholeFlatSummary> {
        return flatSummary;
    }
}

describe("WholeSummaryDocumentStorageService", () => {
    it("downloads summaries in expected format", async () => {
        const service = new WholeSummaryDocumentStorageService(
            "id",
            new MockGitManager() as any,
            DebugLogger.create("fluid:testSummaries"),
        );

        const res = await service.downloadSummary({
            type: SummaryType.Handle,
            handleType: SummaryType.Tree,
            handle: "testHandle",
        });
        assert.deepStrictEqual(res, expectedSummary, "Unexpected summary returned.");
    });
});
