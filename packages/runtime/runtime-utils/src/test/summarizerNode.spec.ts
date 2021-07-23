/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "assert";
import { TelemetryNullLogger } from "@fluidframework/common-utils";
import {
    CreateChildSummarizerNodeParam,
    ISummarizerNode,
    ISummarizerNodeConfig,
} from "@fluidframework/runtime-definitions";
import { ISequencedDocumentMessage, SummaryType } from "@fluidframework/protocol-definitions";
import {
    createRootSummarizerNode,
    IRootSummarizerNode,
} from "../summarizerNode";
import { mergeStats } from "../summaryUtils";

describe("Runtime", () => {
    describe("Summarization", () => {
        describe("Summarizer Node", () => {
            const names = ["root", "mid", "leaf"] as const;
            const ids = ["rootId", "midId", "leafId"] as const;
            let rootNode: IRootSummarizerNode;
            let midNode: ISummarizerNode | undefined;
            let leafNode: ISummarizerNode | undefined;

            const logger = new TelemetryNullLogger();
            let summarizeCalls = [0, 0, 0];
            function assertSummarizeCalls(...expected: [root: number, mid: number, leaf: number]) {
                for (let i = 0; i < expected.length; i++) {
                    assert(expected[i] === summarizeCalls[i],
                        `unexpected ${names[i]} summarize call count: ${expected[i]} !== ${summarizeCalls[i]}`);
                }
            }

            const getSummarizeInternalFn = (depth: 0 | 1 | 2) => async (fullTree: boolean) => {
                summarizeCalls[depth]++;
                return {
                    id: ids[depth],
                    pathPartsForChildren: undefined, // extra path parts between nodes
                    gcData: { gcNodes: {} },
                    stats: mergeStats(),
                    summary: { type: SummaryType.Tree, tree: {} } as const,
                };
            };

            function createRoot({
                changeSeq = 1,
                refSeq,
                ...config
            }: Partial<ISummarizerNodeConfig & {
                changeSeq: number;
                refSeq: number;
            }> = {}) {
                rootNode = createRootSummarizerNode(
                    logger,
                    getSummarizeInternalFn(0),
                    changeSeq,
                    refSeq,
                    config,
                );
            }

            function createMid(
                createParam: CreateChildSummarizerNodeParam,
                config?: ISummarizerNodeConfig,
            ) {
                midNode = rootNode.createChild(
                    getSummarizeInternalFn(1),
                    ids[1],
                    createParam,
                    config,
                );
            }

            function createLeaf(
                createParam: CreateChildSummarizerNodeParam,
                config?: ISummarizerNodeConfig,
            ) {
                leafNode = midNode?.createChild(
                    getSummarizeInternalFn(2),
                    ids[2],
                    createParam,
                    config,
                );
            }

            const fakeOp = (sequenceNumber: number): ISequencedDocumentMessage =>
                // eslint-disable-next-line @typescript-eslint/consistent-type-assertions
                ({ sequenceNumber } as ISequencedDocumentMessage);

            beforeEach(() => {
                summarizeCalls = [0, 0, 0];
            });

            it("Should fail summarize if startSummary is not called", () => {
                createRoot();
                try {
                    rootNode.summarize(false);
                    throw Error("Expected to fail");
                } catch (error) {
                    assert(error.message === "0x1a1" || error.message === "0x1a2",
                        "no wip referenceSequenceNumber or logger");
                }
                assertSummarizeCalls(0, 0, 0);
            });

            it("Should call summarize internal", async () => {
                createRoot();
                rootNode.recordChange(fakeOp(12));
                rootNode.startSummary(11, logger);
                const result = await rootNode.summarize(false);
                assertSummarizeCalls(1, 0, 0);
                assert(result.summary.type === SummaryType.Tree, "should be tree");
            });

            it("Should not call summarize internal and instead use handle", async () => {
                createRoot();
                rootNode.recordChange(fakeOp(11));
                rootNode.startSummary(11, logger);
                const result = await rootNode.summarize(false);
                assertSummarizeCalls(0, 0, 0);
                assert(result.summary.type === SummaryType.Handle, "should be handle");
            });

            it("Should call summarize internal always when fullTree true", async () => {
                createRoot();
                rootNode.recordChange(fakeOp(10));
                rootNode.startSummary(11, logger);
                const result = await rootNode.summarize(true);
                assertSummarizeCalls(1, 0, 0);
                assert(result.summary.type === SummaryType.Tree, "should be tree");
            });

            it("Should fail startSummary if previous attempt is not completed/cleared", () => {
                createRoot();
                rootNode.startSummary(11, logger);
                try {
                    rootNode.startSummary(12, logger);
                    throw Error("Expected to fail");
                } catch (error) {
                    assert(error.message === "0x19f" || error.message === "0x1a0",
                        "wip referenceSequenceNumber and logger are still set");
                }
            });

            it("Should succeed startSummary if previous attempt is completed", () => {
                createRoot();
                rootNode.startSummary(11, logger);
                rootNode.completeSummary("test-handle");
                rootNode.startSummary(12, logger);
            });

            it("Should succeed startSummary if previous attempt is cleared", () => {
                createRoot();
                rootNode.startSummary(11, logger);
                rootNode.clearSummary();
                rootNode.startSummary(12, logger);
            });
        });
    });
});
