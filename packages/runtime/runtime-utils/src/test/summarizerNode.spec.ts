/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "assert";

import { ISequencedDocumentMessage, ISnapshotTree, SummaryType } from "@fluidframework/protocol-definitions";
import {
    channelsTreeName,
    CreateChildSummarizerNodeParam,
    CreateSummarizerNodeSource,
    ISummarizerNode,
    ISummarizerNodeConfig,
} from "@fluidframework/runtime-definitions";
import { TelemetryNullLogger } from "@fluidframework/telemetry-utils";

import {
    createRootSummarizerNode,
    IRootSummarizerNode,
} from "../summarizerNode";
// eslint-disable-next-line import/no-internal-modules
import { SummarizerNode } from "../summarizerNode/summarizerNode";
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

            function expectThrow(
                fn: () => unknown,
                failMsg: string,
                errMsg: string,
                ...expectedErrors: string[]
            ): void {
                try {
                    fn();
                    throw Error(`${failMsg}: Expected to fail`);
                } catch (error: any) {
                    assert(expectedErrors.some((e) => e === error.message), errMsg);
                }
            }

            async function expectReject(
                fn: () => Promise<unknown>,
                failMsg: string,
                errMsg: string,
                ...expectedErrors: string[]
            ): Promise<void> {
                try {
                    await fn();
                    throw Error(`${failMsg}: Expected to reject`);
                } catch (error: any) {
                    assert(expectedErrors.some((e) => e === error.message), errMsg);
                }
            }

            const summaryRefSeq = 123;
            const blobs = {
                protocolAttributes: { sequenceNumber: summaryRefSeq },
            } as const;
            const readAndParseBlob = async <T>(id: string) => blobs[id] as T;
            const fakeOp = (sequenceNumber: number): ISequencedDocumentMessage =>
                // eslint-disable-next-line @typescript-eslint/consistent-type-assertions
                ({ sequenceNumber } as ISequencedDocumentMessage);

            const emptySnapshot: ISnapshotTree = { blobs: {}, trees: {} };
            const protocolTree: ISnapshotTree = { blobs: { attributes: "protocolAttributes" }, trees: {} };
            const coreSnapshot: ISnapshotTree = { blobs: {}, trees: {
                [ids[1]]: { blobs: {}, trees: {
                    [ids[2]]: emptySnapshot,
                } },
            } };
            const simpleSnapshot: ISnapshotTree = { blobs: {}, trees: {
                ...coreSnapshot.trees,
                ".protocol": protocolTree,
            } };
            const channelsSnapshot: ISnapshotTree = { blobs: {}, trees: {
                [channelsTreeName]: coreSnapshot,
                ".protocol": protocolTree,
            } };
            const getSnapshot = async () => simpleSnapshot;

            beforeEach(() => {
                summarizeCalls = [0, 0, 0];
            });

            describe("Create Child", () => {
                it("Should fail to create child from summary if parent does not have summary", () => {
                    createRoot();
                    expectThrow(
                        () => createMid({ type: CreateSummarizerNodeSource.FromSummary }),
                        "create child",
                        "no parent summary",
                        "0x1ac",
                    );
                    assert(midNode === undefined, "should not be created");
                });

                it("Should fail to create child with same id", () => {
                    createRoot();
                    createMid({ type: CreateSummarizerNodeSource.Local });
                    expectThrow(
                        () => createMid({ type: CreateSummarizerNodeSource.Local }),
                        "create child",
                        "child node with same id already exists",
                        "0x1ab",
                    );
                });
            });

            describe("Load Base Summary", () => {
                it("Load base summary should do nothing for simple snapshot", async () => {
                    createRoot({ refSeq: 1 });
                    rootNode.updateBaseSummaryState(simpleSnapshot);

                    const latestSummary = (rootNode as SummarizerNode).latestSummary;
                    assert(latestSummary !== undefined, "latest summary should exist");
                    assert.strictEqual(latestSummary.additionalPath?.path, undefined,
                        "should not have any path parts for children");
                });

                it("Load base summary should strip channels subtree", async () => {
                    createRoot({ refSeq: 1 });
                    rootNode.updateBaseSummaryState(channelsSnapshot);

                    const latestSummary = (rootNode as SummarizerNode).latestSummary;
                    assert(latestSummary !== undefined, "latest summary should exist");
                    assert.strictEqual(latestSummary.additionalPath?.path, channelsTreeName,
                        "should have channels path for children");
                });
            });

            describe("Start Summary", () => {
                it("Should fail startSummary if previous attempt is not completed/cleared", () => {
                    createRoot();
                    rootNode.startSummary(11, logger);
                    expectThrow(
                        () => rootNode.startSummary(12, logger),
                        "start summary",
                        "wip referenceSequenceNumber and logger are still set",
                        "0x19f", "0x1a0",
                    );
                });

                it("Should succeed startSummary if previous attempt is completed", async () => {
                    createRoot();
                    rootNode.startSummary(11, logger);
                    await rootNode.summarize(false);
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

            describe("Complete Summary", () => {
                it("Should fail completeSummary if summarize not called", () => {
                    createRoot();
                    rootNode.startSummary(11, logger);
                    expectThrow(
                        () => rootNode.completeSummary("test-handle"),
                        "complete summary",
                        "tracked local paths not set",
                        "0x1a5",
                    );
                });

                it("Should fail completeSummary if summarize not called on child node", async () => {
                    createRoot();
                    createMid({ type: CreateSummarizerNodeSource.Local });
                    createLeaf({ type: CreateSummarizerNodeSource.Local });
                    rootNode.startSummary(11, logger);
                    await rootNode.summarize(false);
                    await leafNode?.summarize(false);
                    expectThrow(
                        () => rootNode.completeSummary("test-handle"),
                        "complete summary",
                        "tracked local paths not set",
                        "0x1a5",
                    );
                });
            });

            describe("Summarize", () => {
                it("Should fail summarize if startSummary is not called", async () => {
                    createRoot();
                    await expectReject(
                        async () => rootNode.summarize(false),
                        "summarize",
                        "no wip referenceSequenceNumber or logger",
                        "0x1a1", "0x1a2",
                    );
                    assertSummarizeCalls(0, 0, 0);
                });

                it("Should call summarize internal with later op", async () => {
                    createRoot({ refSeq: 11 });
                    rootNode.recordChange(fakeOp(12));
                    rootNode.startSummary(99, logger);
                    const result = await rootNode.summarize(false);
                    assertSummarizeCalls(1, 0, 0);
                    assert(result.summary.type === SummaryType.Tree, "should be tree");
                });

                it("Should call summarize internal with later invalidate", async () => {
                    createRoot({ refSeq: 11 });
                    rootNode.invalidate(12);
                    rootNode.startSummary(99, logger);
                    const result = await rootNode.summarize(false);
                    assertSummarizeCalls(1, 0, 0);
                    assert(result.summary.type === SummaryType.Tree, "should be tree");
                });

                it("Should not call summarize internal and instead use handle", async () => {
                    createRoot({ refSeq: 11 });
                    rootNode.recordChange(fakeOp(11));
                    rootNode.startSummary(99, logger);
                    const result = await rootNode.summarize(false);
                    assertSummarizeCalls(0, 0, 0);
                    assert(result.summary.type === SummaryType.Handle, "should be handle");
                });

                it("Should call summarize internal always when fullTree true", async () => {
                    createRoot({ refSeq: 11 });
                    rootNode.recordChange(fakeOp(10));
                    rootNode.startSummary(99, logger);
                    const result = await rootNode.summarize(true);
                    assertSummarizeCalls(1, 0, 0);
                    assert(result.summary.type === SummaryType.Tree, "should be tree");
                });
            });

            describe("Refresh Latest Summary", () => {
                it("Should refresh from tree when no proposal handle provided", async () => {
                    createRoot();
                    const result = await rootNode.refreshLatestSummary(
                        undefined,
                        summaryRefSeq,
                        getSnapshot,
                        readAndParseBlob,
                        logger,
                    );
                    assert(result.latestSummaryUpdated === true, "should update");
                    assert(result.wasSummaryTracked === false, "should not be tracked");
                    assert(result.snapshot !== undefined, "should have tree result");
                });

                it("Should refresh from tree when proposal handle not pending", async () => {
                    createRoot();
                    const result = await rootNode.refreshLatestSummary(
                        "test-handle",
                        summaryRefSeq,
                        getSnapshot,
                        readAndParseBlob,
                        logger,
                    );
                    assert(result.latestSummaryUpdated === true, "should update");
                    assert(result.wasSummaryTracked === false, "should not be tracked");
                    assert(result.snapshot !== undefined, "should have tree result");
                });

                it("Should not refresh latest if already passed ref seq number", async () => {
                    createRoot({ refSeq: summaryRefSeq });
                    const result = await rootNode.refreshLatestSummary(
                        undefined,
                        summaryRefSeq,
                        getSnapshot,
                        readAndParseBlob,
                        logger,
                    );
                    assert(result.latestSummaryUpdated === false, "we already got this summary");
                });

                it("Should refresh from pending", async () => {
                    createRoot();
                    const proposalHandle = "test-handle";

                    rootNode.startSummary(10, logger);
                    await rootNode.summarize(false);
                    rootNode.completeSummary(proposalHandle);

                    const result = await rootNode.refreshLatestSummary(
                        proposalHandle,
                        summaryRefSeq,
                        getSnapshot,
                        readAndParseBlob,
                        logger,
                    );
                    assert(result.latestSummaryUpdated === true, "should update");
                    assert(result.wasSummaryTracked === true, "should be tracked");
                });
            });
        });
    });
});
