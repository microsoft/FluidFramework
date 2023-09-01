/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "assert";

import { ILoggingError } from "@fluidframework/core-interfaces";
import {
	ISequencedDocumentMessage,
	ISnapshotTree,
	SummaryType,
} from "@fluidframework/protocol-definitions";
import {
	channelsTreeName,
	CreateChildSummarizerNodeParam,
	CreateSummarizerNodeSource,
	ISummarizerNode,
	ISummarizerNodeConfig,
} from "@fluidframework/runtime-definitions";
import { mergeStats } from "@fluidframework/runtime-utils";
import { TelemetryDataTag, createChildLogger } from "@fluidframework/telemetry-utils";

import { createRootSummarizerNode, IRootSummarizerNode } from "../summary";
// eslint-disable-next-line import/no-internal-modules
import { SummarizerNode } from "../summary/summarizerNode/summarizerNode";
// eslint-disable-next-line import/no-internal-modules
import { ValidateSummaryResult } from "../summary/summarizerNode";

describe("Runtime", () => {
	describe("Summarization", () => {
		describe("Summarizer Node", () => {
			const names = ["root", "mid", "leaf"] as const;
			const ids = ["rootId", "midId", "leafId"] as const;
			let rootNode: IRootSummarizerNode;
			let midNode: ISummarizerNode | undefined;
			let leafNode: ISummarizerNode | undefined;

			const logger = createChildLogger();
			let summarizeCalls = [0, 0, 0];
			function assertSummarizeCalls(...expected: [root: number, mid: number, leaf: number]) {
				for (let i = 0; i < expected.length; i++) {
					assert(
						expected[i] === summarizeCalls[i],
						`unexpected ${names[i]} summarize call count: ${expected[i]} !== ${summarizeCalls[i]}`,
					);
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
			}: Partial<
				ISummarizerNodeConfig & {
					changeSeq: number;
					refSeq: number;
				}
			> = {}) {
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
				} catch (error: unknown) {
					assert(
						expectedErrors.some((e) => e === (error as ILoggingError).message),
						errMsg,
					);
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
				} catch (error: unknown) {
					assert(
						expectedErrors.some((e) => e === (error as ILoggingError).message),
						errMsg,
					);
				}
			}

			const summaryRefSeq = 123;
			const fakeOp = (sequenceNumber: number): ISequencedDocumentMessage =>
				// eslint-disable-next-line @typescript-eslint/consistent-type-assertions
				({ sequenceNumber } as ISequencedDocumentMessage);

			const emptySnapshot: ISnapshotTree = { blobs: {}, trees: {} };
			const protocolTree: ISnapshotTree = {
				blobs: { attributes: "protocolAttributes" },
				trees: {},
			};
			const coreSnapshot: ISnapshotTree = {
				blobs: {},
				trees: {
					[ids[1]]: {
						blobs: {},
						trees: {
							[ids[2]]: emptySnapshot,
						},
					},
				},
			};
			const simpleSnapshot: ISnapshotTree = {
				blobs: {},
				trees: {
					...coreSnapshot.trees,
					".protocol": protocolTree,
				},
			};
			const channelsSnapshot: ISnapshotTree = {
				blobs: {},
				trees: {
					[channelsTreeName]: coreSnapshot,
					".protocol": protocolTree,
				},
			};

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
					assert.strictEqual(
						latestSummary.additionalPath?.path,
						undefined,
						"should not have any path parts for children",
					);
				});

				it("Load base summary should strip channels subtree", async () => {
					createRoot({ refSeq: 1 });
					rootNode.updateBaseSummaryState(channelsSnapshot);

					const latestSummary = (rootNode as SummarizerNode).latestSummary;
					assert(latestSummary !== undefined, "latest summary should exist");
					assert.strictEqual(
						latestSummary.additionalPath?.path,
						channelsTreeName,
						"should have channels path for children",
					);
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
						"0x19f",
						"0x1a0",
					);
				});

				it("Should succeed startSummary if previous attempt is completed", async () => {
					createRoot();
					rootNode.startSummary(11, logger);
					await rootNode.summarize(false);
					rootNode.completeSummary("test-handle", true /* validateSummary */);
					rootNode.startSummary(12, logger);
				});

				it("Should succeed startSummary if previous attempt is cleared", () => {
					createRoot();
					rootNode.startSummary(11, logger);
					rootNode.clearSummary();
					rootNode.startSummary(12, logger);
				});
			});

			describe("Validate Summary", () => {
				it("summary validation should fail if summarize not called on root node", () => {
					createRoot();
					rootNode.startSummary(11, logger);

					// Validate summary fails by calling validateSummary.
					const expectedResult: ValidateSummaryResult = {
						success: false,
						reason: "NodeDidNotSummarize",
						id: {
							tag: TelemetryDataTag.CodeArtifact,
							value: "",
						},
						retryAfterSeconds: 1,
					};
					const result = rootNode.validateSummary();
					assert.deepStrictEqual(
						result,
						expectedResult,
						"validate summary should have failed at the root node",
					);

					// Validate summary fails by calling completeSummary.
					assert.throws(
						() => rootNode.completeSummary("test-handle", true /* validateSummary */),
						(error: any) => {
							const correctErrorMessage = error.message === "NodeDidNotSummarize";
							const correctErrorId = error.id.value === "";
							return correctErrorMessage && correctErrorId;
						},
						"Complete summary should have failed at the root node",
					);
				});

				it("summary validation should fail if summarize not called on child node", async () => {
					createRoot();
					createMid({ type: CreateSummarizerNodeSource.Local });
					createLeaf({ type: CreateSummarizerNodeSource.Local });
					rootNode.startSummary(11, logger);
					await rootNode.summarize(false);
					await leafNode?.summarize(false);
					const midNodeId = `/${ids[1]}`;

					// Validate summary fails by calling validateSummary.
					const expectedResult: ValidateSummaryResult = {
						success: false,
						reason: "NodeDidNotSummarize",
						id: {
							tag: TelemetryDataTag.CodeArtifact,
							value: midNodeId,
						},
						retryAfterSeconds: 1,
					};
					const result = rootNode.validateSummary();
					assert.deepStrictEqual(
						result,
						expectedResult,
						"validate summary should have failed at the mid node",
					);

					assert.throws(
						() => rootNode.completeSummary("test-handle", true /* validateSummary */),
						(error: any) => {
							const correctErrorMessage = error.message === "NodeDidNotSummarize";
							const correctErrorId = error.id.value === midNodeId;
							return correctErrorMessage && correctErrorId;
						},
						"Complete summary should have failed at the mid node",
					);
				});

				it("summary validation should fail if summarize not called on leaf node", async () => {
					createRoot();
					createMid({ type: CreateSummarizerNodeSource.Local });
					createLeaf({ type: CreateSummarizerNodeSource.Local });
					rootNode.startSummary(11, logger);
					await rootNode.summarize(false);
					await midNode?.summarize(false);
					const leafNodeId = `/${ids[1]}/${ids[2]}`;

					// Validate summary fails by calling validateSummary.
					const expectedResult: ValidateSummaryResult = {
						success: false,
						reason: "NodeDidNotSummarize",
						id: {
							tag: TelemetryDataTag.CodeArtifact,
							value: leafNodeId,
						},
						retryAfterSeconds: 1,
					};
					const result = rootNode.validateSummary();
					assert.deepStrictEqual(
						result,
						expectedResult,
						"validate summary should have failed at the leaf node",
					);

					// Validate summary fails by calling completeSummary.
					assert.throws(
						() => rootNode.completeSummary("test-handle", true /* validateSummary */),
						(error: any) => {
							const correctErrorMessage = error.message === "NodeDidNotSummarize";
							const correctErrorId = error.id.value === leafNodeId;
							return correctErrorMessage && correctErrorId;
						},
						"Complete summary should have failed at the leaf node",
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
						"0x1a1",
						"0x1a2",
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
					const result = await rootNode.refreshLatestSummary(undefined, summaryRefSeq);
					assert(result.latestSummaryUpdated === true, "should update");
					assert(result.wasSummaryTracked === false, "should not be tracked");
				});

				it("Should not refresh latest if already passed ref seq number", async () => {
					createRoot({ refSeq: summaryRefSeq });
					const result = await rootNode.refreshLatestSummary(undefined, summaryRefSeq);
					assert(result.latestSummaryUpdated === false, "we already got this summary");
				});

				it("Should refresh from pending", async () => {
					createRoot();
					const proposalHandle = "test-handle";

					rootNode.startSummary(10, logger);
					await rootNode.summarize(false);
					rootNode.completeSummary(proposalHandle, true /* validateSummary */);

					const result = await rootNode.refreshLatestSummary(
						proposalHandle,
						summaryRefSeq,
					);
					assert(result.latestSummaryUpdated === true, "should update");
					assert(result.wasSummaryTracked === true, "should be tracked");
				});

				it("should fail refresh when summary is in progress", async () => {
					createRoot();
					const proposalHandle = "test-handle";

					const referenceSeqNum = 10;
					rootNode.startSummary(referenceSeqNum, logger);
					await rootNode.summarize(false);
					await assert.rejects(
						async () => rootNode.refreshLatestSummary(proposalHandle, summaryRefSeq),
						(
							error: ILoggingError & { inProgressSummaryRefSeq: number | undefined },
						) => {
							const correctErrorMessage =
								error.message === "UnexpectedRefreshDuringSummarize";
							const correctInProgressRefSeq =
								error.inProgressSummaryRefSeq === referenceSeqNum;
							return correctErrorMessage && correctInProgressRefSeq;
						},
						"Refresh should fail if called when summary is in progress",
					);
				});
			});
		});
	});
});
