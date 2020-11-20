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
import { SummarizerNodeWithReferences } from "../summarizerNodeWithReferences";
import { mergeStats } from "../summaryUtils";

describe("SummarizerNodeWithReferences Tests", () => {
    const nodeId = "testNode";
    const subNodeId = "subNode";
    const subNodeId2 = "subNode2";

    let summarizeReferences = [
        { path: nodeId, routes: [`${nodeId}/${subNodeId}`] },
        { path: `${nodeId}/${subNodeId}`, routes: [nodeId] },
    ];
    let rootSummarizerNode: SummarizerNodeWithReferences;

    beforeEach(async () => {
        rootSummarizerNode = SummarizerNodeWithReferences.createRoot(
            new TelemetryNullLogger(),
            (() => undefined) as unknown as SummarizeInternalFn,
            0,
            0);
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
            references: summarizeReferences,
            id: nodeId,
        };
    }

    it("can return fluid object references from summarize internal", async () => {
        const summarizerNode = rootSummarizerNode.createChild(
            summarizeInternal,
            nodeId,
            { type: CreateSummarizerNodeSource.FromSummary },
        );

        // Call summarize with fullTree as true. This will force the summarizer node to call summarizeInternal.
        const summarizeResult = await summarizerNode.summarize(true /* fullTree */, true /* trackState */);
        assert.deepStrictEqual(
            summarizeResult.references,
            summarizeReferences,
            "Summarizer node did not return correct summarize internal references",
        );
    });

    it("can return initial fluid object references", async () => {
        const initialReferences = [
            { path: nodeId, routes: [`${nodeId}/${subNodeId2}`] },
            { path: `${nodeId}/${subNodeId2}`, routes: [nodeId] },
        ];
        const getInitialFluidObjectReferences = async () => { return Promise.resolve(initialReferences); };

        const summarizerNode = rootSummarizerNode.createChild(
            summarizeInternal,
            nodeId,
            { type: CreateSummarizerNodeSource.FromSummary },
            undefined,
            getInitialFluidObjectReferences,
        );

        // Call summarize with fullTree as false. The summarizer node will not attempt to call summarizeInternal.
        // It should instead call getInitialFluidObjectReferences to get the initial references.
        const summarizeResult = await summarizerNode.summarize(false /* fullTree */, true /* trackState */);
        assert.deepStrictEqual(
            summarizeResult.references,
            initialReferences,
            "Summarizer node did not return correct initial references",
        );
    });

    it("can return cached fluid object references", async () => {
        const summarizerNode = rootSummarizerNode.createChild(
            summarizeInternal,
            nodeId,
            { type: CreateSummarizerNodeSource.FromSummary },
            undefined,
        );

        // Call summarize with fullTree as true. This will force the summarizer node to call summarizeInternal.
        let summarizeResult = await summarizerNode.summarize(true /* fullTree */, true /* trackState */);
        assert.deepStrictEqual(
            summarizeResult.references,
            summarizeReferences,
            "Summarizer node did not return correct initial references",
        );

        // Call summarize with fullTree as false. The summarizer node will not attempt to call summarizeInternal.
        // It should instead use the cached value of references from the previous run.
        summarizeResult = await summarizerNode.summarize(false /* fullTree */, true /* trackState */);
        assert.deepStrictEqual(
            summarizeResult.references,
            summarizeReferences,
            "Summarizer node did not return correct cached references",
        );
    });

    it("can return updated fluid object references when not tracking state", async () => {
        const summarizerNode = rootSummarizerNode.createChild(
            summarizeInternal,
            nodeId,
            { type: CreateSummarizerNodeSource.FromSummary },
            undefined,
        );

        // Call summarize with trackState as false. This will force the summarizer node to call summarizeInternal.
        let summarizeResult = await summarizerNode.summarize(false /* fullTree */, false /* trackState */);
        assert.deepStrictEqual(
            summarizeResult.references,
            summarizeReferences,
            "Summarizer node did not return correct summarize internal references",
        );

        // Update the references returned by summarizeInternal.
        summarizeReferences = [
            { path: nodeId, routes: [`${nodeId}/${subNodeId2}`] },
            { path: `${nodeId}/${subNodeId2}`, routes: [nodeId] },
        ];

        // The above summarize call would have cached the returned references. Call summarize again with trackState
        // as false. This will force it to call summarizeInternal again and we should get the updated references.
        summarizeResult = await summarizerNode.summarize(false /* fullTree */, false /* trackState */);
        assert.deepStrictEqual(
            summarizeResult.references,
            summarizeReferences,
            "Summarizer node did not return updated summarize internal references",
        );
    });
});
