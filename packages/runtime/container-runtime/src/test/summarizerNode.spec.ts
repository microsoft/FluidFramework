/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "node:assert";

import { ILoggingError } from "@fluidframework/core-interfaces/internal";
import { SummaryType } from "@fluidframework/driver-definitions";
import { ISequencedDocumentMessage } from "@fluidframework/driver-definitions/internal";
import {
	CreateChildSummarizerNodeParam,
	CreateSummarizerNodeSource,
	ISummarizerNode,
	ISummarizerNodeConfig,
} from "@fluidframework/runtime-definitions/internal";
import { mergeStats } from "@fluidframework/runtime-utils/internal";
import { TelemetryDataTag, createChildLogger } from "@fluidframework/telemetry-utils/internal";

import { IRootSummarizerNode, createRootSummarizerNode } from "../summary/index.js";
// eslint-disable-next-line import/no-internal-modules
import { ValidateSummaryResult } from "../summary/summarizerNode/index.js";

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
				midNode = rootNode.createChild(getSummarizeInternalFn(1), ids[1], createParam, config);
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
					throw new Error(`${failMsg}: Expected to fail`);
				} catch (error: unknown) {
					assert(
						expectedErrors.includes((error as ILoggingError).message),
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
					throw new Error(`${failMsg}: Expected to reject`);
				} catch (error: unknown) {
					assert(
						expectedErrors.includes((error as ILoggingError).message),
						errMsg,
					);
				}
			}

			const summaryRefSeq = 123;
			const fakeOp = (sequenceNumber: number): ISequencedDocumentMessage =>
				// eslint-disable-next-line @typescript-eslint/consistent-type-assertions
				({ sequenceNumber }) as ISequencedDocumentMessage;

			beforeEach(() => {
				summarizeCalls = [0, 0, 0];
			});

			describe("Create Child", () => {
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

			describe("Start Summary", () => {
				it("Should fail startSummary if previous attempt is not completed/cleared", () => {
					createRoot();
					rootNode.startSummary(11, logger, 0);
					expectThrow(
						() => rootNode.startSummary(12, logger, 0),
						"start summary",
						"wip referenceSequenceNumber and logger are still set",
						"0x19f",
						"0x1a0",
					);
				});

				it("Should succeed startSummary if previous attempt is completed", async () => {
					createRoot();
					rootNode.startSummary(11, logger, 0);
					await rootNode.summarize(false);
					rootNode.completeSummary("test-handle");
					rootNode.startSummary(12, logger, 0); // This is 0 since we did not "ack" the latest summary
				});

				it("Should succeed startSummary if previous attempt is cleared", () => {
					createRoot();
					rootNode.startSummary(11, logger, 0);
					rootNode.clearSummary();
					rootNode.startSummary(12, logger, 0); // This is 0 since we did not "ack" the latest summary
				});

				it("Should succeed startSummary with the right sequence number", async () => {
					createRoot();
					rootNode.startSummary(11, logger, 0);
					await rootNode.summarize(false);
					rootNode.completeSummary("test-handle");
					// Refreshing should be necessary for startSummary to occur
					await rootNode.refreshLatestSummary("test-handle", 11);
					const result = rootNode.startSummary(12, logger, 11);
					assert.strictEqual(result.invalidNodes, 0, "startSummary have succeeded");
				});

				it("Should fail startSummary when missing refresh", async () => {
					createRoot();
					// Need one latest summary
					rootNode.startSummary(11, logger, 0);
					await rootNode.summarize(false);
					rootNode.completeSummary("test-handle");
					await rootNode.refreshLatestSummary("test-handle", 11);

					// Summary with missing refresh
					rootNode.startSummary(12, logger, 11);
					await rootNode.summarize(false);
					rootNode.completeSummary("test-handle");

					// Failing to refresh the root node should generate failing summaries
					const result = rootNode.startSummary(21, logger, 12);
					assert.strictEqual(result.invalidNodes, 1, "startSummary fails due to no refresh");
					assert.deepEqual(
						result.mismatchNumbers,
						new Set(["12-11"]),
						"startSummary should have mismatched numbers",
					);
				});

				it("Should fail startSummary with the wrong sequence number", async () => {
					createRoot();
					rootNode.startSummary(11, logger, 0);
					await rootNode.summarize(false);
					rootNode.completeSummary("test-handle");
					await rootNode.refreshLatestSummary("test-handle", 11);
					const result = rootNode.startSummary(12, logger, 0); // 0 is wrong here (so we can get invalid results)
					assert.strictEqual(result.invalidNodes, 1, "expected failure wrong ref seq");
					assert.deepEqual(
						result.mismatchNumbers,
						new Set(["0-11"]),
						"startSummary have succeeded",
					);
				});
			});

			describe("Validate Summary", () => {
				it("summary validation should fail if summarize not called on root node", () => {
					createRoot();
					rootNode.startSummary(11, logger, 0);

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
				});

				it("summary validation should fail if summarize not called on child node", async () => {
					createRoot();
					createMid({ type: CreateSummarizerNodeSource.Local });
					createLeaf({ type: CreateSummarizerNodeSource.Local });
					rootNode.startSummary(11, logger, 0);
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
				});

				it("summary validation should fail if summarize not called on leaf node", async () => {
					createRoot();
					createMid({ type: CreateSummarizerNodeSource.Local });
					createLeaf({ type: CreateSummarizerNodeSource.Local });
					rootNode.startSummary(11, logger, 0);
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
				});
			});

			describe("Summarize", () => {
				it("Should fail completeSummary if startSummary is not called", async () => {
					createRoot();
					await expectReject(
						async () => rootNode.completeSummary("handle"),
						"summarize",
						"no wip referenceSequenceNumber or logger",
						"0x1a4",
					);
					assertSummarizeCalls(0, 0, 0);
				});

				it("Should fail validateSummary if startSummary is not called", async () => {
					createRoot();
					await expectReject(
						async () => rootNode.validateSummary(),
						"summarize",
						"no wip referenceSequenceNumber or logger",
						"0x6fc",
						"0x6fd",
					);
					assertSummarizeCalls(0, 0, 0);
				});

				it("Should call summarize internal with later op", async () => {
					createRoot({ refSeq: 11 });
					rootNode.recordChange(fakeOp(12));
					rootNode.startSummary(99, logger, 11);
					const result = await rootNode.summarize(false);
					assertSummarizeCalls(1, 0, 0);
					assert(result.summary.type === SummaryType.Tree, "should be tree");
				});

				it("Should call summarize internal with later invalidate", async () => {
					createRoot({ refSeq: 11 });
					rootNode.invalidate(12);
					rootNode.startSummary(99, logger, 11);
					const result = await rootNode.summarize(false);
					assertSummarizeCalls(1, 0, 0);
					assert(result.summary.type === SummaryType.Tree, "should be tree");
				});

				it("Should not call summarize internal and instead use handle", async () => {
					createRoot({ refSeq: 11 });
					rootNode.recordChange(fakeOp(11));
					rootNode.startSummary(99, logger, 11);
					const result = await rootNode.summarize(false);
					assertSummarizeCalls(0, 0, 0);
					assert(result.summary.type === SummaryType.Handle, "should be handle");
				});

				it("Should call summarize internal always when fullTree true", async () => {
					createRoot({ refSeq: 11 });
					rootNode.recordChange(fakeOp(10));
					rootNode.startSummary(99, logger, 11);
					const result = await rootNode.summarize(true);
					assertSummarizeCalls(1, 0, 0);
					assert(result.summary.type === SummaryType.Tree, "should be tree");
				});
			});

			describe("Refresh Latest Summary", () => {
				it("Should not refresh latest if already passed ref seq number", async () => {
					createRoot({ refSeq: summaryRefSeq });
					const result = await rootNode.refreshLatestSummary("test-handle", summaryRefSeq);
					assert(!result.isSummaryTracked, "we already got this summary");
				});

				it("Should refresh from pending", async () => {
					createRoot();
					const proposalHandle = "test-handle";

					rootNode.startSummary(10, logger, 0);
					await rootNode.summarize(false);
					rootNode.completeSummary(proposalHandle);

					const result = await rootNode.refreshLatestSummary(proposalHandle, summaryRefSeq);
					assert(result.isSummaryTracked, "should be tracked");
					assert(result.isSummaryNewer === true, "should be newer");
				});

				it("should fail refresh when summary is in progress", async () => {
					createRoot();
					const proposalHandle = "test-handle";

					const referenceSeqNum = 10;
					rootNode.startSummary(referenceSeqNum, logger, 0);
					await rootNode.summarize(false);
					await assert.rejects(
						async () => rootNode.refreshLatestSummary(proposalHandle, summaryRefSeq),
						(error: ILoggingError & { inProgressSummaryRefSeq: number | undefined }) => {
							const correctErrorMessage = error.message === "UnexpectedRefreshDuringSummarize";
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
