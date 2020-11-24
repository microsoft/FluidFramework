/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "assert";
import { TelemetryNullLogger } from "@fluidframework/common-utils";
import { SummaryType } from "@fluidframework/protocol-definitions";
import {
    CreateSummarizerNodeSource,
    ISummarizeInternalResult,
    SummarizeInternalFn,
} from "@fluidframework/runtime-definitions";
import { IRootSummarizerNodeWithGC } from "../summarizerNodeWithGc";
import { mergeStats } from "../summaryUtils";
import { createRootSummarizerNodeWithGC } from "../summarizerNodeContract";

describe("SummarizerNodeWithGC Tests", () => {
    const summarizerNodeId = "testNode";
    const node1Id = "/gcNode1";
    const node2Id = "/gcNode1/subNode1";
    const node3Id = "/gcNode1/subNode2";

    let summarizeGCNodes = [
        { id: node1Id, outboundRoutes: [ node2Id ] },
        { id: node2Id, outboundRoutes: [ node1Id ] },
    ];
    let rootSummarizerNode: IRootSummarizerNodeWithGC;

    beforeEach(async () => {
        rootSummarizerNode = createRootSummarizerNodeWithGC(
            new TelemetryNullLogger(),
            (() => undefined) as unknown as SummarizeInternalFn,
            0,
            0);
        rootSummarizerNode.startSummary(0, new TelemetryNullLogger());
    });

    async function summarizeInternal(fullTree: boolean, trackState: boolean): Promise<ISummarizeInternalResult> {
        const stats = mergeStats();
        stats.treeNodeCount++;
        return {
            summary: {
                type: SummaryType.Tree,
                tree: {},
            },
            stats,
            gcNodes: summarizeGCNodes,
            id: summarizerNodeId,
        };
    }

    it("can return correct garbage collection nodes from summarize internal", async () => {
        const summarizerNode = rootSummarizerNode.createChild(
            summarizeInternal,
            summarizerNodeId,
            { type: CreateSummarizerNodeSource.FromSummary },
        );

        // Call summarize with fullTree as true. This will force the summarizer node to call summarizeInternal.
        const summarizeResult = await summarizerNode.summarize(true /* fullTree */, true /* trackState */);
        assert.deepStrictEqual(
            summarizeResult.gcNodes,
            summarizeGCNodes,
            "Summarizer node did not return correct GC nodes from summarize internal",
        );
    });

    it("can return initial garbage collection nodes", async () => {
        const initialGCNodes = [
            { id: node1Id, outboundRoutes: [ node3Id ] },
            { id: node3Id, outboundRoutes: [ node2Id, node1Id ] },
        ];
        const getInitialGCNodes = async () => { return Promise.resolve(initialGCNodes); };

        const summarizerNode = rootSummarizerNode.createChild(
            summarizeInternal,
            summarizerNodeId,
            { type: CreateSummarizerNodeSource.FromSummary },
            undefined,
            getInitialGCNodes,
        );

        // Call summarize with fullTree as false. The summarizer node will not attempt to call summarizeInternal.
        // It should instead call getInitialGCNodes to get the initial GC nodes.
        const summarizeResult = await summarizerNode.summarize(false /* fullTree */, true /* trackState */);
        assert.deepStrictEqual(
            summarizeResult.gcNodes,
            initialGCNodes,
            "Summarizer node did not return correct initial GC nodes",
        );
    });

    it("can return cached garbage collection nodes", async () => {
        const summarizerNode = rootSummarizerNode.createChild(
            summarizeInternal,
            summarizerNodeId,
            { type: CreateSummarizerNodeSource.FromSummary },
            undefined,
        );

        // Call summarize with fullTree as true. This will force the summarizer node to call summarizeInternal.
        let summarizeResult = await summarizerNode.summarize(true /* fullTree */, true /* trackState */);
        assert.deepStrictEqual(
            summarizeResult.gcNodes,
            summarizeGCNodes,
            "Summarizer node did not return correct GC nodes from summarize Internal",
        );

        // Call summarize with fullTree as false. The summarizer node will not attempt to call summarizeInternal.
        // It should instead use the cached value of GC nodes from the previous run.
        summarizeResult = await summarizerNode.summarize(false /* fullTree */, true /* trackState */);
        assert.deepStrictEqual(
            summarizeResult.gcNodes,
            summarizeGCNodes,
            "Summarizer node did not return correct cached GC nodes",
        );
    });

    it("can return updated garbage collection nodes when not tracking state", async () => {
        const summarizerNode = rootSummarizerNode.createChild(
            summarizeInternal,
            summarizerNodeId,
            { type: CreateSummarizerNodeSource.FromSummary },
            undefined,
        );

        // Call summarize with trackState as false. This will force the summarizer node to call summarizeInternal.
        let summarizeResult = await summarizerNode.summarize(false /* fullTree */, false /* trackState */);
        assert.deepStrictEqual(
            summarizeResult.gcNodes,
            summarizeGCNodes,
            "Summarizer node did not return correct GC nodes from summarize internal",
        );

        // Update the GC nodes returned by summarizeInternal.
        summarizeGCNodes = [
            { id: node1Id, outboundRoutes: [ node3Id ] },
            { id: node3Id, outboundRoutes: [] },
        ];

        // The above summarize call would have cached the returned GC nodes. Call summarize again with trackState
        // as false. This will force it to call summarizeInternal again and we should get the updated GC nodes.
        summarizeResult = await summarizerNode.summarize(false /* fullTree */, false /* trackState */);
        assert.deepStrictEqual(
            summarizeResult.gcNodes,
            summarizeGCNodes,
            "Summarizer node did not return updated GC nodes from summarize internal",
        );
    });
});
