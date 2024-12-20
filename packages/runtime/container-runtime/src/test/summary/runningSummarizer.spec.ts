/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "assert";

import { TypedEventEmitter } from "@fluid-internal/client-utils";
import { IDeltaManager } from "@fluidframework/container-definitions/internal";
import {
	IContainerRuntimeEvents,
	type ISummarizeEventProps,
} from "@fluidframework/container-runtime-definitions/internal";
import {
	ConfigTypes,
	IConfigProviderBase,
	ITelemetryBaseEvent,
} from "@fluidframework/core-interfaces";
import { Deferred } from "@fluidframework/core-utils/internal";
import { SummaryType } from "@fluidframework/driver-definitions";
import {
	IDocumentMessage,
	ISummaryAck,
	ISummaryNack,
	ISummaryProposal,
	MessageType,
	ISequencedDocumentMessage,
} from "@fluidframework/driver-definitions/internal";
import { isRuntimeMessage } from "@fluidframework/driver-utils/internal";
import { MockLogger, mixinMonitoringContext } from "@fluidframework/telemetry-utils/internal";
import { MockDeltaManager } from "@fluidframework/test-runtime-utils/internal";
import sinon from "sinon";

import { ISummaryConfiguration } from "../../containerRuntime.js";
import {
	IGeneratedSummaryStats,
	ISummarizeHeuristicData,
	ISummarizerRuntime,
	ISummaryCancellationToken,
	RetriableSummaryError,
	RunningSummarizer,
	SubmitSummaryResult,
	SummarizeHeuristicData,
	SummaryCollection,
	getFailMessage,
	neverCancelledSummaryToken,
} from "../../summary/index.js";
import {
	defaultMaxAttempts,
	defaultMaxAttemptsForSubmitFailures,
	// eslint-disable-next-line import/no-internal-modules
} from "../../summary/runningSummarizer.js";

class MockRuntime extends TypedEventEmitter<IContainerRuntimeEvents> {
	disposed = false;

	constructor(
		public readonly deltaManager: IDeltaManager<ISequencedDocumentMessage, IDocumentMessage>,
	) {
		super();
	}

	closeFn() {
		this.disposed = true;
	}
}

const configProvider = (settings: Record<string, ConfigTypes>): IConfigProviderBase => ({
	getRawConfig: (name: string): ConfigTypes => settings[name],
});

describe("Runtime", () => {
	describe("Summarization", () => {
		describe("RunningSummarizer", () => {
			let stopCall: number;
			let runCount: number;
			let fullTreeRunCount: number;
			let clock: sinon.SinonFakeTimers;
			let mockLogger: MockLogger;
			let settings = {};
			let mockDeltaManager: MockDeltaManager;
			let summaryCollection: SummaryCollection;
			let summarizer: RunningSummarizer;
			const summarizerClientId = "test";
			let lastRefSeq = 0;
			let lastClientSeq: number;
			let lastSummarySeq: number;
			let mockRuntime: MockRuntime;
			let heuristicData: ISummarizeHeuristicData;
			const summaryCommon = {
				maxAckWaitTime: 120000, // 2 min
				maxOpsSinceLastSummary: 7000,
				initialSummarizerDelayMs: 0,
			};
			const summaryConfig: ISummaryConfiguration = {
				state: "enabled",
				maxTime: 5000 * 12, // 1 min (active)
				maxOps: 1000, // 1k ops (active)
				minOpsForLastSummaryAttempt: 50,
				minIdleTime: 5000, // 5 sec (idle)
				maxIdleTime: 5000, // This must remain the same as minIdleTime for tests to pass nicely
				nonRuntimeOpWeight: 0.1,
				runtimeOpWeight: 1.0,
				nonRuntimeHeuristicThreshold: 20,
				...summaryCommon,
			};
			const summaryConfigDisableHeuristics: ISummaryConfiguration = {
				state: "disableHeuristics",
				...summaryCommon,
			};

			const emptySummaryStats: IGeneratedSummaryStats = {
				treeNodeCount: 0,
				blobNodeCount: 0,
				handleNodeCount: 0,
				totalBlobSize: 0,
				dataStoreCount: 0,
				summarizedDataStoreCount: 0,
				unreferencedBlobSize: 0,
				summaryNumber: 0,
			};

			let shouldDeferGenerateSummary: boolean = false;
			let deferGenerateSummary: Deferred<void> | undefined;

			const flushPromises = async () => new Promise((resolve) => process.nextTick(resolve));

			async function emitNextOp(
				increment: number = 1,
				timestamp: number = Date.now(),
				type: string = MessageType.Operation,
			) {
				heuristicData.numRuntimeOps += increment - 1; // -1 because we emit an op below
				lastRefSeq += increment;
				const op: Partial<ISequencedDocumentMessage> = {
					sequenceNumber: lastRefSeq,
					timestamp,
					type,
				};
				mockDeltaManager.emit("op", op);
				mockRuntime.emit("op", op, isRuntimeMessage({ type }));
				await flushPromises();
			}

			async function emitNoOp(increment: number = 1) {
				heuristicData.numNonRuntimeOps += increment - 1; // -1 because we emit an op below
				lastRefSeq += increment;
				const op: Partial<ISequencedDocumentMessage> = {
					sequenceNumber: lastRefSeq,
					timestamp: Date.now(),
					type: MessageType.NoOp,
				};
				mockDeltaManager.emit("op", op);
				mockRuntime.emit("op", op, isRuntimeMessage({ type: MessageType.NoOp }));
				await flushPromises();
			}

			function emitBroadcast(timestamp = Date.now()) {
				const referenceSequenceNumber = lastRefSeq;
				lastSummarySeq = ++lastRefSeq;
				const op = {
					type: MessageType.Summarize,
					clientId: summarizerClientId,
					referenceSequenceNumber,
					clientSequenceNumber: ++lastClientSeq,
					sequenceNumber: lastSummarySeq,
					contents: {
						handle: "test-broadcast-handle",
					},
					timestamp,
				};
				mockDeltaManager.emit("op", op);
				mockRuntime.emit("op", op, isRuntimeMessage(op));
			}

			async function emitAck() {
				const summaryProposal: ISummaryProposal = {
					summarySequenceNumber: lastSummarySeq,
				};
				const contents: ISummaryAck = {
					handle: "test-ack-handle",
					summaryProposal,
				};
				const op = {
					data: JSON.stringify(contents),
					type: MessageType.SummaryAck,
					sequenceNumber: ++lastRefSeq,
				};
				mockDeltaManager.emit("op", op);
				mockRuntime.emit("op", op, isRuntimeMessage(op));

				await flushPromises(); // let summarize run
			}

			async function emitNack(retryAfterSeconds?: number) {
				const summaryProposal: ISummaryProposal = {
					summarySequenceNumber: lastSummarySeq,
				};
				const contents: ISummaryNack & { retryAfter?: number } = {
					summaryProposal,
					retryAfter: retryAfterSeconds,
					message: "test-nack",
				};
				const op = {
					data: JSON.stringify(contents),
					type: MessageType.SummaryNack,
					sequenceNumber: ++lastRefSeq,
				};
				mockDeltaManager.emit("op", op);
				mockRuntime.emit("op", op, isRuntimeMessage(op));

				await flushPromises();
			}

			async function tickAndFlushPromises(ms: number) {
				clock.tick(ms);
				await flushPromises();
			}

			function assertRunCounts(
				expectedTotalRunCount: number,
				expectedFullTreeRunCount: number,
				errorMessage?: string,
				expectedStopCount = 0,
			) {
				const errorPrefix = errorMessage ? `${errorMessage}: ` : "";
				assert.strictEqual(
					runCount,
					expectedTotalRunCount,
					`${errorPrefix}unexpected total run count`,
				);
				assert.strictEqual(
					fullTreeRunCount,
					expectedFullTreeRunCount,
					`${errorPrefix}unexpected fullTree count`,
				);
				assert.strictEqual(
					stopCall,
					expectedStopCount,
					`${errorPrefix}summarizer should${
						expectedStopCount === 1 ? "" : " not"
					} have stopped`,
				);
			}

			async function successfulSubmitSummary(): Promise<SubmitSummaryResult> {
				// emitBroadcast will increment this number
				const lastRefSeqBefore = lastRefSeq;

				// immediate broadcast
				emitBroadcast();

				if (shouldDeferGenerateSummary) {
					deferGenerateSummary = new Deferred<void>();
					await deferGenerateSummary.promise;
					deferGenerateSummary = undefined;
				}
				return {
					stage: "submit",
					referenceSequenceNumber: lastRefSeqBefore,
					minimumSequenceNumber: 0,
					generateDuration: 0,
					uploadDuration: 0,
					submitOpDuration: 0,
					summaryTree: { type: SummaryType.Tree, tree: {} },
					summaryStats: emptySummaryStats,
					handle: "test-handle",
					clientSequenceNumber: lastClientSeq,
				} as const;
			}

			const startRunningSummarizer = async (
				disableHeuristics?: boolean,
				submitSummaryCallback: () => Promise<SubmitSummaryResult> = successfulSubmitSummary,
				cancellationToken: ISummaryCancellationToken = neverCancelledSummaryToken,
			): Promise<void> => {
				heuristicData = new SummarizeHeuristicData(0, {
					refSequenceNumber: 0,
					summaryTime: Date.now(),
				});
				summarizer = await RunningSummarizer.start(
					mockLogger,
					summaryCollection.createWatcher(summarizerClientId),
					disableHeuristics ? summaryConfigDisableHeuristics : summaryConfig,
					async (options) => {
						runCount++;
						heuristicData.recordAttempt(lastRefSeq);

						const { fullTree = false } = options;
						if (fullTree) {
							fullTreeRunCount++;
						}
						return submitSummaryCallback();
					},
					async (options) => {},
					heuristicData,
					summaryCollection,
					cancellationToken,
					// stopSummarizerCallback
					(reason) => {
						stopCall++;
					},
					mockRuntime as any as ISummarizerRuntime,
				);
			};

			before(() => {
				clock = sinon.useFakeTimers();
			});

			after(() => {
				clock.restore();
			});

			beforeEach(async () => {
				shouldDeferGenerateSummary = false;
				deferGenerateSummary = undefined;
				clock.reset();
				runCount = 0;
				stopCall = 0;
				fullTreeRunCount = 0;
				lastRefSeq = 0;
				lastClientSeq = -1000; // negative/decrement for test
				lastSummarySeq = 0; // negative/decrement for test
				settings = {};
				mockLogger = mixinMonitoringContext(new MockLogger(), configProvider(settings)).logger;
				mockDeltaManager = new MockDeltaManager();
				mockRuntime = new MockRuntime(mockDeltaManager);
				summaryCollection = new SummaryCollection(
					mockDeltaManager,
					mockLogger.toTelemetryLogger(),
				);
			});

			describe("Summary Schedule", () => {
				beforeEach(async () => {
					await startRunningSummarizer();
				});

				it("Should summarize after configured number of ops when not pending", async () => {
					// too early, should not run yet
					await emitNextOp(summaryConfig.maxOps);
					assertRunCounts(0, 0);

					// now should run
					await emitNextOp(1);
					assertRunCounts(1, 0);
					assert(
						mockLogger.matchEvents([
							{ eventName: "Running:Summarize_generate", summarizeCount: runCount },
							{ eventName: "Running:Summarize_Op", summarizeCount: runCount },
						]),
						"unexpected log sequence",
					);

					// should not run, because our summary hasnt been acked/nacked yet
					await emitNextOp(summaryConfig.maxOps + 1);
					assertRunCounts(1, 0);

					// should run, because another op has come in, and our summary has been acked
					await emitAck();
					assertRunCounts(2, 0);
					assert(
						mockLogger.matchEvents([
							{ eventName: "Running:Summarize_end", summarizeCount: runCount - 1 }, // ack for previous run
							{ eventName: "Running:Summarize_generate", summarizeCount: runCount },
							{ eventName: "Running:Summarize_Op", summarizeCount: runCount },
						]),
						"unexpected log sequence",
					);

					await emitNextOp();
					assertRunCounts(2, 0);
					assert(
						!mockLogger.matchEvents([{ eventName: "Running:Summarize_end" }]),
						"No ack expected yet",
					);
				});

				it("Should summarize after configured idle time when not pending", async () => {
					await emitNextOp();

					// too early, should not run yet
					await tickAndFlushPromises(summaryConfig.minIdleTime - 1);
					assertRunCounts(0, 0);

					// now should run
					await tickAndFlushPromises(1);
					assertRunCounts(1, 0);

					// should not run, because our summary hasnt been acked/nacked yet
					await emitNextOp();
					await tickAndFlushPromises(summaryConfig.minIdleTime);
					assertRunCounts(1, 0);

					// should run, because another op has come in, and our summary has been acked
					await emitAck();
					await emitNextOp();
					await tickAndFlushPromises(summaryConfig.minIdleTime);
					assertRunCounts(2, 0);
				});

				it("Should summarize after configured active time when not pending", async () => {
					const idlesPerActive = Math.floor(
						(summaryConfig.maxTime + 1) / (summaryConfig.minIdleTime - 1),
					);
					const remainingTime = (summaryConfig.maxTime + 1) % (summaryConfig.minIdleTime - 1);
					await emitNextOp();

					// too early should not run yet
					for (let i = 0; i < idlesPerActive; i++) {
						// prevent idle from triggering with periodic ops
						await tickAndFlushPromises(summaryConfig.minIdleTime - 1);
						await emitNextOp();
					}
					await tickAndFlushPromises(remainingTime - 1);
					await emitNextOp();
					assertRunCounts(0, 0);

					// now should run
					await tickAndFlushPromises(1);
					await emitNextOp();
					assertRunCounts(1, 0);

					// should not run because our summary hasnt been acked/nacked yet
					for (let i = 0; i < idlesPerActive; i++) {
						// prevent idle from triggering with periodic ops
						await tickAndFlushPromises(summaryConfig.minIdleTime - 1);
						await emitNextOp();
					}
					await tickAndFlushPromises(remainingTime);
					await emitNextOp();
					assertRunCounts(1, 0);

					// should run, because another op has come in, and our summary has been acked
					await emitAck();
					await emitNextOp();
					assertRunCounts(2, 0);
				});

				it("Should summarize after pending timeout", async () => {
					// first run to start pending
					await emitNextOp(summaryConfig.maxOps + 1);
					assertRunCounts(1, 0);

					// should not run because still pending
					await tickAndFlushPromises(summaryConfig.maxAckWaitTime - 1);
					await emitNextOp(summaryConfig.maxOps + 1);
					assertRunCounts(1, 0);

					// should run because pending timeout
					await tickAndFlushPromises(1);
					await emitNextOp();
					assertRunCounts(2, 0);

					// verify subsequent ack works
					await emitNextOp(summaryConfig.maxOps + 1);
					assertRunCounts(2, 0);
					await emitAck();
					await emitNextOp();
					assertRunCounts(3, 0);
				});

				it("Should not cause pending ack timeouts using older summary time", async () => {
					shouldDeferGenerateSummary = true;
					await emitNextOp();

					// should do first summary fine
					await emitNextOp(summaryConfig.maxOps);
					assertRunCounts(1, 0);
					assert(deferGenerateSummary !== undefined, "submitSummary was not called");
					deferGenerateSummary.resolve();
					await emitAck();

					// pass time that should not count towards the next max ack wait time
					await tickAndFlushPromises(summaryConfig.maxAckWaitTime);

					// subsequent summary should not cancel pending!
					await emitNextOp(summaryConfig.maxOps + 1);
					assertRunCounts(2, 0);
					await emitNextOp(); // fine
					await tickAndFlushPromises(1); // next op will exceed maxAckWaitTime from first summary
					await emitNextOp(); // not fine, nay cancel pending too soon
					assert(deferGenerateSummary !== undefined, "submitSummary was not called");
					deferGenerateSummary.resolve();

					// we should not generate another summary without previous ack
					await emitNextOp(); // flush finish summarizing
					await emitNextOp(summaryConfig.maxOps + 1);
					assertRunCounts(2, 0);
				});

				it("Should summarize one last time before closing >=min ops", async () => {
					await emitNextOp(summaryConfig.minOpsForLastSummaryAttempt);
					const stopP = summarizer.waitStop(true);
					await flushPromises();
					await emitAck();
					await stopP;

					assertRunCounts(1, 0, "should perform lastSummary");
				});

				it("Should not summarize one last time before closing <min ops", async () => {
					await emitNextOp(summaryConfig.minOpsForLastSummaryAttempt - 1);
					const stopP = summarizer.waitStop(true);
					await flushPromises();
					await emitAck();
					await stopP;

					assertRunCounts(0, 0, "should not perform lastSummary");
				});

				it("Should not summarize when processing summary ack op", async () => {
					await emitNextOp(summaryConfig.maxOps);
					assertRunCounts(0, 0, "should not perform summary");

					await emitAck();
					assertRunCounts(0, 0, "should not perform summary");
				});

				it("Should not summarize when processing summary nack op", async () => {
					await emitNextOp(summaryConfig.maxOps);
					assertRunCounts(0, 0, "should not perform summary");

					await emitNack();
					assertRunCounts(0, 0, "should not perform summary");
				});

				it("Should not summarize when processing summarize op", async () => {
					await emitNextOp(summaryConfig.maxOps);
					assertRunCounts(0, 0, "should not perform summary");

					await emitNextOp(1, Date.now(), MessageType.Summarize);
					assertRunCounts(0, 0, "should not perform summary");
				});

				it("Should not include Summarize ops with runtime count", async () => {
					assert.strictEqual(heuristicData.numRuntimeOps, 0);
					assert.strictEqual(heuristicData.numNonRuntimeOps, 0);

					await emitNextOp(1, Date.now(), MessageType.Summarize);

					assert.strictEqual(heuristicData.numRuntimeOps, 0);
					assert.strictEqual(heuristicData.numNonRuntimeOps, 1);
				});

				it("Should not summarize on non-runtime op before threshold is reached", async () => {
					// Creating RunningSummarizer starts heuristics automatically
					await emitNoOp(1);
					await tickAndFlushPromises(summaryConfig.minIdleTime);
					assertRunCounts(1, 0, "should perform summary");
					await emitAck();

					assert(
						summaryConfig.nonRuntimeHeuristicThreshold !== undefined,
						"Expect nonRuntimeHeuristicThreshold to be provided",
					);

					await emitNoOp(summaryConfig.nonRuntimeHeuristicThreshold - 3); // Summarize and SummaryAck are included
					await tickAndFlushPromises(summaryConfig.minIdleTime);

					assertRunCounts(1, 0, "should not perform summary");
					assert.strictEqual(heuristicData.numRuntimeOps, 0);
					assert.strictEqual(
						heuristicData.numNonRuntimeOps,
						summaryConfig.nonRuntimeHeuristicThreshold - 1,
					);

					await emitNoOp(1);
					await tickAndFlushPromises(summaryConfig.minIdleTime);

					assertRunCounts(2, 0, "should perform summary");
				});
			});

			describe("Summarization attempts with retry", () => {
				beforeEach(async () => {
					shouldDeferGenerateSummary = false;
					deferGenerateSummary = undefined;
				});

				type SummaryStage = SubmitSummaryResult["stage"];

				/**
				 * Validate that a summary attempt fails as expected, correct events are received and summarization
				 * stops (or doesn't) as per the given params.
				 * @param attemptNumber - The current attempt number.
				 * @param totalAttempts - The total number of attempts. After the last attempt, summarizer should close.
				 * @param lastSuccessfulStage - The stage after which summarization failed.
				 * @param retryAfterSeconds - The number of seconds after which the next attempt should be tried.
				 */
				const validateSummaryAttemptFails = async (
					attemptNumber: number,
					totalAttempts: number,
					lastSuccessfulStage: SummaryStage,
					retryAfterSeconds: number | undefined,
				) => {
					const finalAttempt = attemptNumber >= totalAttempts;
					// Nack the summary with "retryAfterSeconds" specified.
					await emitNack(retryAfterSeconds);

					assertRunCounts(
						attemptNumber,
						0,
						`Total run count should be ${attemptNumber}`,
						finalAttempt ? 1 : 0 /* expectedStopCount */,
					);

					const retryProps1 = {
						summarizeCount: 1,
						summaryAttempts: attemptNumber,
						stage: lastSuccessfulStage,
					};
					const expectedEvents: Omit<ITelemetryBaseEvent, "category">[] = [
						{
							eventName: "Running:Summarize_cancel",
							...retryProps1,
							retryAfterSeconds,
							reason: getFailMessage(
								lastSuccessfulStage === "submit"
									? "summaryNack" // if last stage is submit, summarization fails due to summary nack
									: "submitSummaryFailure", // other stages fail because summary is not submitted
							),
						},
					];

					// After the final attempt, there shouldn't be any delay.
					if (!finalAttempt) {
						expectedEvents.push({
							eventName: "Running:SummarizeAttemptDelay",
							...retryProps1,
							duration: retryAfterSeconds ? retryAfterSeconds * 1000 : undefined,
						});
					}
					mockLogger.assertMatch(
						expectedEvents,
						`Summarizer attempt ${attemptNumber} did not fail as expected`,
					);

					// After the final attempt, summarizer should stop.
					assert.strictEqual(
						stopCall,
						finalAttempt ? 1 : 0,
						`Summarizer should${
							finalAttempt ? "" : " not"
						} have stopped after ${totalAttempts} attempts`,
					);
				};

				// Callback that fails the summary for all stages expect submit. For submit, the summarization
				// will fail because of summary ack not received withing timeout.
				const submitSummaryCallback = async (
					stage: SummaryStage,
					retryAfterSeconds: number | undefined,
				): Promise<SubmitSummaryResult> => {
					if (stage === "submit") {
						return successfulSubmitSummary();
					} else {
						const error = new RetriableSummaryError(
							`Fail summarization at ${stage}`,
							retryAfterSeconds,
						);
						const failedResult: Partial<SubmitSummaryResult> = {
							stage,
							referenceSequenceNumber: lastRefSeq,
							minimumSequenceNumber: 0,
							error,
						};
						return failedResult as SubmitSummaryResult;
					}
				};

				it(`should not retry when summary attempt succeeds`, async () => {
					await startRunningSummarizer();

					await emitNextOp();
					// This should run a summarization because max ops has reached.
					await emitNextOp(summaryConfig.maxOps);
					assertRunCounts(1, 0, `Total run count should be 1`);

					await emitAck();
					assertRunCounts(1, 0, `The run count should still be 1`);
					assert.strictEqual(stopCall, 0, "Summarizer should not have stopped");
				});

				it(`should retry once when summary attempt fails with summary op timeout`, async () => {
					await startRunningSummarizer();

					// This should run a summarization because max ops has reached.
					await emitNextOp(summaryConfig.maxOps + 1);
					assertRunCounts(1, 0);

					// This should not run because summary op is pending
					await tickAndFlushPromises(summaryConfig.maxAckWaitTime - 1);
					await emitNextOp(summaryConfig.maxOps + 1);
					assertRunCounts(1, 0);

					// Should do another attempt.
					await tickAndFlushPromises(1);
					assertRunCounts(2, 0);

					// verify subsequent ack works
					await emitNextOp(summaryConfig.maxOps + 1);
					assertRunCounts(2, 0);
					await emitAck();
					await emitNextOp();
					assertRunCounts(3, 0);
				});

				it(`should retry once when summary attempt fails with summary ack timeout`, async () => {
					await startRunningSummarizer();

					// This should run a summarization because max ops has reached.
					await emitNextOp(summaryConfig.maxOps + 1);
					assertRunCounts(1, 0);

					// Emit summarize op.
					emitBroadcast();

					// This should not run because summary ack is pending
					await tickAndFlushPromises(summaryConfig.maxAckWaitTime - 1);
					await emitNextOp(summaryConfig.maxOps + 1);
					assertRunCounts(1, 0);

					// Should do another attempt.
					await tickAndFlushPromises(1);
					assertRunCounts(2, 0);

					// verify subsequent ack works
					await emitNextOp(summaryConfig.maxOps + 1);
					assertRunCounts(2, 0);
					await emitAck();
					await emitNextOp();
					assertRunCounts(3, 0);
				});

				const failedStages: SummaryStage[] = ["submit"];
				for (const [stageIndex, stage] of failedStages.entries()) {
					// When stage is "submit", the submit stage was successful and default max attempts is used
					// for any other failures.
					// const maxAttempts =
					// 	stage === "submit"
					// 		? defaultMaxAttempts
					// 		: defaultMaxAttemptsForSubmitFailures;
					const maxAttempts = 2;
					const titleStage = stage === "submit" ? "nack" : stage;

					it(`should attempt 1 time only on failure without retry specified at ${titleStage} stage`, async () => {
						await startRunningSummarizer(undefined /* disableHeuristics */, async () =>
							submitSummaryCallback(stage, undefined /* retryAfterSeconds */),
						);

						await emitNextOp();
						// This should run a summarization because max ops has reached.
						await emitNextOp(summaryConfig.maxOps);
						await validateSummaryAttemptFails(
							1 /* attemptNumber */,
							1 /* totalAttempts */,
							stage,
							undefined /* retryAfterSeconds */,
						);
					});

					it(`should attempt ${maxAttempts} times on failure with retryAfterSeconds at ${titleStage} stage`, async () => {
						const retryAfterSeconds = 5;
						await startRunningSummarizer(undefined /* disableHeuristics */, async () =>
							submitSummaryCallback(stage, retryAfterSeconds),
						);

						await emitNextOp();
						// This should run a summarization because max ops has reached.
						await emitNextOp(summaryConfig.maxOps);

						for (let attemptNumber = 1; attemptNumber <= maxAttempts; attemptNumber++) {
							await validateSummaryAttemptFails(
								attemptNumber,
								maxAttempts,
								stage,
								retryAfterSeconds,
							);
							// Wait for "retryAfterSeconds". The next attempt should start after this.
							await tickAndFlushPromises(retryAfterSeconds * 1000 + 1);
						}

						// validate that summarization is not run again.
						assertRunCounts(
							maxAttempts,
							0,
							`Summarization should not have been attempted more than ${maxAttempts} times`,
							1 /** expectedStopCount */,
						);
					});

					it(`should attempt ${maxAttempts} times on failure when stage changes from ${titleStage}`, async () => {
						// Helper to get a different stage from the current one.
						const getNewStage = () => {
							let index = stageIndex + 1;
							// If the new stage is "submit", get another stage instead. This is because the logic is
							// different when failure happens after "submit" stage. This is validated in a separate test.
							if (index > failedStages.length - 2) {
								index = 0;
							}
							return failedStages[index];
						};

						const retryAfterSeconds = 5;
						let currentStage: SummaryStage = stage;

						await startRunningSummarizer(undefined /* disableHeuristics */, async () => {
							if (currentStage === "submit") {
								return successfulSubmitSummary();
							} else {
								const error = new RetriableSummaryError(
									`Fail summarization at ${currentStage}`,
									retryAfterSeconds,
								);
								const failedResult: Partial<SubmitSummaryResult> = {
									stage: currentStage,
									referenceSequenceNumber: lastRefSeq,
									minimumSequenceNumber: 0,
									error,
								};
								return failedResult as SubmitSummaryResult;
							}
						});

						await emitNextOp();
						// This should run a summarization because max ops has reached.
						await emitNextOp(summaryConfig.maxOps);

						for (let attemptNumber = 1; attemptNumber <= maxAttempts; attemptNumber++) {
							await validateSummaryAttemptFails(
								attemptNumber,
								maxAttempts,
								currentStage,
								retryAfterSeconds,
							);

							// Change the failure stage after 2 attempts.
							if (attemptNumber === 2) {
								currentStage = getNewStage();
							}

							// Wait for "retryAfterSeconds". The next attempt should start after this.
							await tickAndFlushPromises(retryAfterSeconds * 1000 + 1);
						}

						// Validate summarization is not run again.
						assertRunCounts(
							maxAttempts,
							0,
							`Summarization should not have been attempted more than ${maxAttempts} times`,
							1 /** expectedStopCount */,
						);
					});

					it(`should update max attempts on failure at ${titleStage} stage as per AttemptsForSubmitFailures`, async () => {
						const retryAfterSeconds = 5;
						const maxAttemptsOverride =
							stage === "submit"
								? defaultMaxAttempts
								: defaultMaxAttemptsForSubmitFailures - 1;
						settings["Fluid.Summarizer.AttemptsForSubmitFailures"] = maxAttemptsOverride;

						await startRunningSummarizer(undefined /* disableHeuristics */, async () =>
							submitSummaryCallback(stage, retryAfterSeconds),
						);

						await emitNextOp();
						// This should run a summarization because max ops has reached.
						await emitNextOp(summaryConfig.maxOps);

						for (
							let attemptNumber = 1;
							attemptNumber <= maxAttemptsOverride;
							attemptNumber++
						) {
							await validateSummaryAttemptFails(
								attemptNumber,
								maxAttemptsOverride,
								stage,
								retryAfterSeconds,
							);
							// Wait for "retryAfterSeconds". The next attempt should start after this.
							await tickAndFlushPromises(retryAfterSeconds * 1000 + 1);
						}

						// validate that summarization is not run again.
						assertRunCounts(
							maxAttemptsOverride,
							0,
							`Summarization should not have been attempted more than ${maxAttemptsOverride} times`,
							1 /** expectedStopCount */,
						);
					});
				}

				/**
				 * This test validates a special case where summarize failures switch from on of the submit stages to
				 * a nack failure. Submit stage failures are retried more times than nack failures and so when the
				 * failure switches from submit to nack, only one more retry happens irrespective of what the
				 * defaultMaxAttempts value is.
				 */
				for (
					let maxAttempts = 1;
					maxAttempts < defaultMaxAttemptsForSubmitFailures;
					maxAttempts++
				) {
					it(`should attempt one more time when stage changes to nack after ${maxAttempts} failed attempts`, async () => {
						const retryAfterSeconds = 5;
						let currentStage: SummaryStage = maxAttempts === 1 ? "submit" : "generate";

						await startRunningSummarizer(undefined /* disableHeuristics */, async () => {
							if (currentStage === "submit") {
								return successfulSubmitSummary();
							} else {
								const error = new RetriableSummaryError(
									`Fail summarization at ${currentStage}`,
									retryAfterSeconds,
								);
								const failedResult: Partial<SubmitSummaryResult> = {
									stage: currentStage,
									referenceSequenceNumber: lastRefSeq,
									minimumSequenceNumber: 0,
									error,
								};
								return failedResult as SubmitSummaryResult;
							}
						});

						// Fail at the "generate" stage 2 times.
						await emitNextOp();
						// This should run a summarization because max ops has reached.
						await emitNextOp(summaryConfig.maxOps);

						let attemptNumber = 1;
						for (; attemptNumber <= maxAttempts; attemptNumber++) {
							await validateSummaryAttemptFails(
								attemptNumber,
								maxAttempts + 1,
								currentStage,
								retryAfterSeconds,
							);

							// In the third attempt, fail at "submit" stage. This will trigger a nack failure. It should
							// not retry attempts anymore because "defaultMaxAttempts" attempts have already been done.
							if (attemptNumber === maxAttempts - 1) {
								currentStage = "submit";
							}

							// Wait for "retryAfterSeconds". The next attempt should start after this.
							await tickAndFlushPromises(retryAfterSeconds * 1000 + 1);
						}

						// Wait for "retryAfterSeconds". The next attempt should start after this.
						await tickAndFlushPromises(retryAfterSeconds * 1000 + 1);

						await validateSummaryAttemptFails(
							attemptNumber++,
							maxAttempts + 1,
							currentStage,
							retryAfterSeconds,
						);

						// Wait for "retryAfterSeconds". There shouldn't be any more attempts.
						await tickAndFlushPromises(retryAfterSeconds * 1000 + 1);

						// Validate summarization is not run again.
						assertRunCounts(
							maxAttempts + 1,
							0,
							`Summarization should not have been attempted more than ${
								maxAttempts + 1
							} times`,
							1 /** expectedStopCount */,
						);
					});
				}

				it("Should not retry last summary", async () => {
					const stage: SummaryStage = "base";
					const retryAfterSeconds = 10;
					await startRunningSummarizer(undefined /* disableHeuristics */, async () =>
						submitSummaryCallback(stage, retryAfterSeconds),
					);

					// This should trigger last summary when summarizer stops.
					await emitNextOp(summaryConfig.minOpsForLastSummaryAttempt);
					const stopP = summarizer.waitStop(true /* allowLastSummary */);
					await flushPromises();
					await stopP;
					summarizer.dispose();

					assertRunCounts(1, 0, "should perform lastSummary");
					const expectedEvents: Omit<ITelemetryBaseEvent, "category">[] = [
						{
							eventName: "Running:Summarize_cancel",
							retryAfterSeconds,
							summarizeCount: 1,
							stage,
						},
					];
					mockLogger.assertMatch(
						expectedEvents,
						`last summary attempt did not fail as expected`,
					);

					// Wait for "retryAfterSeconds". There shouldn't be any more attempts.
					await tickAndFlushPromises(retryAfterSeconds * 1000 + 1);
					assertRunCounts(1, 0, "should not retry lastSummary");
				});
			});

			describe("On-demand Summaries", () => {
				const reason = "test";
				// This is used to validate the summarizeReason property in telemetry.
				const summarizeReason = `onDemand/${reason}`;

				beforeEach(async () => {
					await startRunningSummarizer();
				});

				it("Should create an on-demand summary", async () => {
					await emitNextOp(2); // set ref seq to 2
					const result = summarizer.summarizeOnDemand({ reason });

					const submitResult = await result.summarySubmitted;
					assertRunCounts(1, 0, "on-demand should run");

					assert(submitResult.success, "on-demand summary should submit");
					assert(
						submitResult.data.stage === "submit",
						"on-demand summary submitted data stage should be submit",
					);

					assert.strictEqual(submitResult.data.referenceSequenceNumber, 2, "ref seq num");
					assert(submitResult.data.summaryTree !== undefined, "summary tree should exist");

					const broadcastResult = await result.summaryOpBroadcasted;
					assert(broadcastResult.success, "summary op should be broadcast");
					assert.strictEqual(
						broadcastResult.data.summarizeOp.referenceSequenceNumber,
						2,
						"summarize op ref seq num should be same as summary seq",
					);
					assert.strictEqual(
						broadcastResult.data.summarizeOp.sequenceNumber,
						3,
						"unexpected summary sequence number",
					);
					assert.strictEqual(
						broadcastResult.data.summarizeOp.contents.handle,
						"test-broadcast-handle",
						"summarize op handle should be test-broadcast-handle",
					);

					assert(
						mockLogger.matchEvents([
							{
								eventName: "Running:Summarize_generate",
								summarizeCount: runCount,
								summarizeReason,
							},
							{
								eventName: "Running:Summarize_Op",
								summarizeCount: runCount,
								summarizeReason,
							},
						]),
						"unexpected log sequence",
					);

					// Verify that heuristics are blocked while waiting for ack
					await emitNextOp(summaryConfig.maxOps + 1);
					assertRunCounts(1, 0);

					await emitAck();
					const ackNackResult = await result.receivedSummaryAckOrNack;
					assert(ackNackResult.success, "on-demand summary should succeed");
					assert(
						ackNackResult.data.summaryAckOp.type === MessageType.SummaryAck,
						"should be ack",
					);
					assert(
						ackNackResult.data.summaryAckOp.contents.handle === "test-ack-handle",
						"summary ack handle should be test-ack-handle",
					);
				});

				it("Should return already running for on-demand summary", async () => {
					// Should start running by heuristics
					await emitNextOp(summaryConfig.maxOps + 1);
					assertRunCounts(1, 0);

					let resolved = false;
					try {
						summarizer.summarizeOnDemand({ reason });
						resolved = true;
					} catch {}

					await flushPromises();
					assert(resolved === false, "already running promise should not resolve yet");
				});

				it("On-demand summary should fail on nack", async () => {
					await emitNextOp(2); // set ref seq to 2
					const result = summarizer.summarizeOnDemand({ reason });

					const submitResult = await result.summarySubmitted;
					assertRunCounts(1, 0, "on-demand should run");

					assert(submitResult.success, "on-demand summary should submit");
					assert(
						submitResult.data.stage === "submit",
						"on-demand summary submitted data stage should be submit",
					);

					assert.strictEqual(submitResult.data.referenceSequenceNumber, 2, "ref seq num");
					assert(submitResult.data.summaryTree !== undefined, "summary tree should exist");

					const broadcastResult = await result.summaryOpBroadcasted;
					assert(broadcastResult.success, "summary op should be broadcast");
					assert.strictEqual(
						broadcastResult.data.summarizeOp.referenceSequenceNumber,
						2,
						"summarize op ref seq num should be same as summary seq",
					);
					assert.strictEqual(
						broadcastResult.data.summarizeOp.sequenceNumber,
						3,
						"unexpected summary sequence number",
					);
					assert.strictEqual(
						broadcastResult.data.summarizeOp.contents.handle,
						"test-broadcast-handle",
						"summarize op handle should be test-broadcast-handle",
					);

					assert(
						mockLogger.matchEvents([
							{
								eventName: "Running:Summarize_generate",
								summarizeCount: runCount,
								summarizeReason,
							},
							{
								eventName: "Running:Summarize_Op",
								summarizeCount: runCount,
								summarizeReason,
							},
						]),
						"unexpected log sequence",
					);

					// Verify that heuristics are blocked while waiting for ack
					await emitNextOp(summaryConfig.maxOps + 1);
					assertRunCounts(1, 0);

					await emitNack();
					const ackNackResult = await result.receivedSummaryAckOrNack;
					assert(!ackNackResult.success, "on-demand summary should fail");
					assert(
						ackNackResult.data?.summaryNackOp.type === MessageType.SummaryNack,
						"should be nack",
					);
					assert(
						JSON.parse((ackNackResult.data.summaryNackOp as any).data).message === "test-nack",
						"summary nack error should be test-nack",
					);
				});

				it("Should fail an on-demand summary if stopping", async () => {
					summarizer.waitStop(true).catch(() => {});
					const fullTree = true;
					const result1 = summarizer.summarizeOnDemand({ reason: "test1" });
					const result2 = summarizer.summarizeOnDemand({
						reason: "test2",
					});
					const result3 = summarizer.summarizeOnDemand({
						reason: "test3",
						fullTree,
					});
					const result4 = summarizer.summarizeOnDemand({
						reason: "test4",
						fullTree,
					});

					const allResults = (
						await Promise.all([
							result1.summarySubmitted,
							result1.summaryOpBroadcasted,
							result1.receivedSummaryAckOrNack,
							result2.summarySubmitted,
							result2.summaryOpBroadcasted,
							result2.receivedSummaryAckOrNack,
						])
					).concat(
						await Promise.all([
							result3.summarySubmitted,
							result3.summaryOpBroadcasted,
							result3.receivedSummaryAckOrNack,
							result4.summarySubmitted,
							result4.summaryOpBroadcasted,
							result4.receivedSummaryAckOrNack,
						]),
					);
					for (const result of allResults) {
						assert(!result.success, "all results should fail");
					}
				});

				it("Should fail an on-demand summary if disposed", async () => {
					summarizer.dispose();
					const fullTree = true;
					const result1 = summarizer.summarizeOnDemand({ reason: "test1" });
					const result2 = summarizer.summarizeOnDemand({
						reason: "test3",
						fullTree,
					});

					const allResults = await Promise.all([
						result1.summarySubmitted,
						result1.summaryOpBroadcasted,
						result1.receivedSummaryAckOrNack,
						result2.summarySubmitted,
						result2.summaryOpBroadcasted,
						result2.receivedSummaryAckOrNack,
					]);
					for (const result of allResults) {
						assert(!result.success, "all results should fail");
					}
				});
			});

			describe("Enqueue Summaries", () => {
				const reason = "test";
				// This is used to validate the summarizeReason property in telemetry.
				const summarizeReason = `enqueuedSummary/enqueue;${reason}`;

				beforeEach(async () => {
					await startRunningSummarizer();
				});

				it("Should summarize after specified sequence number", async () => {
					await emitNextOp(2); // set ref seq to 2
					const afterSequenceNumber = 9;
					const result = summarizer.enqueueSummarize({
						reason,
						afterSequenceNumber,
					});
					assert(result.alreadyEnqueued === undefined, "should not be already enqueued");

					await emitNextOp(6);
					assertRunCounts(0, 0, "enqueued should not run yet, still 1 op short");

					await emitNextOp(1);
					assertRunCounts(1, 0, "enqueued should run");

					const submitResult = await result.summarySubmitted;
					assert(submitResult.success, "enqueued summary should submit");
					assert(
						submitResult.data.stage === "submit",
						"enqueued summary submitted data stage should be submit",
					);

					assert.strictEqual(submitResult.data.referenceSequenceNumber, 9, "ref seq num");
					assert(submitResult.data.summaryTree !== undefined, "summary tree should exist");

					const broadcastResult = await result.summaryOpBroadcasted;
					assert(broadcastResult.success, "summary op should be broadcast");
					assert.strictEqual(
						broadcastResult.data.summarizeOp.referenceSequenceNumber,
						9,
						"summarize op ref seq num should be same as summary seq",
					);
					assert.strictEqual(
						broadcastResult.data.summarizeOp.sequenceNumber,
						10,
						"unexpected summary sequence number",
					);
					assert.strictEqual(
						broadcastResult.data.summarizeOp.contents.handle,
						"test-broadcast-handle",
						"summarize op handle should be test-broadcast-handle",
					);

					assert(
						mockLogger.matchEvents([
							{
								eventName: "Running:Summarize_generate",
								summarizeCount: runCount,
								summarizeReason,
							},
							{
								eventName: "Running:Summarize_Op",
								summarizeCount: runCount,
								summarizeReason,
							},
						]),
						"unexpected log sequence",
					);

					// Verify that heuristics are blocked while waiting for ack
					await emitNextOp(summaryConfig.maxOps + 1);
					assertRunCounts(1, 0);

					await emitAck();
					const ackNackResult = await result.receivedSummaryAckOrNack;
					assert(ackNackResult.success, "enqueued summary should succeed");
					assert(
						ackNackResult.data.summaryAckOp.type === MessageType.SummaryAck,
						"should be ack",
					);
					assert(
						ackNackResult.data.summaryAckOp.contents.handle === "test-ack-handle",
						"summary ack handle should be test-ack-handle",
					);
				});

				it("Should summarize after specified sequence number after heuristics attempt finishes", async () => {
					const afterSequenceNumber = summaryConfig.maxOps * 2 + 10;

					// Should start running by heuristics
					await emitNextOp(summaryConfig.maxOps + 1);
					assertRunCounts(1, 0);

					const result = summarizer.enqueueSummarize({
						reason,
						afterSequenceNumber,
					});
					assert(result.alreadyEnqueued === undefined, "should not be already enqueued");
					let submitRan = false;
					result.summarySubmitted.then(
						() => {
							submitRan = true;
						},
						() => {},
					);

					// Even after finishing first heuristic summary, enqueued shouldn't run yet.
					await emitAck();

					// Should start running by heuristics again.
					await emitNextOp(summaryConfig.maxOps + 1);
					assertRunCounts(2, 0);
					await emitNextOp(20); // make sure enqueued is ready
					assert(
						submitRan === false,
						"enqueued summary should not run until 2nd heuristic ack",
					);

					// After this ack, it should start running enqueued summary.
					await emitAck();
					assert((submitRan as boolean) === true, "enqueued summary should run");
					assertRunCounts(3, 0);

					const submitResult = await result.summarySubmitted;
					assert(submitResult.success, "enqueued summary should submit");
					assert(
						submitResult.data.stage === "submit",
						"enqueued summary submitted data stage should be submit",
					);

					// 26 = 22 regular runtime ops + 2 summary ack ops + 2 summarize ops
					const expectedRefSeqNum = summaryConfig.maxOps * 2 + 26;
					assert.strictEqual(
						submitResult.data.referenceSequenceNumber,
						expectedRefSeqNum,
						"ref seq num",
					);
					assert(submitResult.data.summaryTree !== undefined, "summary tree should exist");

					const broadcastResult = await result.summaryOpBroadcasted;
					assert(broadcastResult.success, "summary op should be broadcast");
					assert.strictEqual(
						broadcastResult.data.summarizeOp.referenceSequenceNumber,
						expectedRefSeqNum,
						"summarize op ref seq num should be same as summary seq",
					);
					assert.strictEqual(
						broadcastResult.data.summarizeOp.sequenceNumber,
						expectedRefSeqNum + 1,
						"unexpected summary sequence number",
					);
					assert.strictEqual(
						broadcastResult.data.summarizeOp.contents.handle,
						"test-broadcast-handle",
						"summarize op handle should be test-broadcast-handle",
					);

					// Verify that heuristics are blocked while waiting for ack
					await emitNextOp(summaryConfig.maxOps + 1);
					assertRunCounts(3, 0);

					await emitAck();
					const ackNackResult = await result.receivedSummaryAckOrNack;
					assert(ackNackResult.success, "enqueued summary should succeed");
					assert(
						ackNackResult.data.summaryAckOp.type === MessageType.SummaryAck,
						"should be ack",
					);
					assert(
						ackNackResult.data.summaryAckOp.contents.handle === "test-ack-handle",
						"summary ack handle should be test-ack-handle",
					);
				});

				it("Should reject subsequent enqueued summarize attempt unless overridden", async () => {
					await emitNextOp(2); // set ref seq to 2
					const afterSequenceNumber = 9;
					const result = summarizer.enqueueSummarize({
						reason,
						afterSequenceNumber,
					});
					assert(result.alreadyEnqueued === undefined, "should not be already enqueued");

					// While first attempt is still enqueued, it should reject subsequent ones
					const result2 = summarizer.enqueueSummarize({ reason: "test-fail" });
					assert(result2.alreadyEnqueued === true, "should be already enqueued");
					assert(result2.overridden === undefined, "should not be overridden");

					const result3 = summarizer.enqueueSummarize({
						reason: "test-override",
						override: true,
					});
					assert(result3.alreadyEnqueued === true, "should be already enqueued");
					assert(result3.overridden === true, "should be overridden");

					const firstResults = await Promise.all([
						result.summarySubmitted,
						result.summaryOpBroadcasted,
						result.receivedSummaryAckOrNack,
					]);
					for (const firstResult of firstResults) {
						assert(firstResult.success === false, "should fail because of override");
					}

					await emitAck();
					const newResults = await Promise.all([
						result3.summarySubmitted,
						result3.summaryOpBroadcasted,
						result3.receivedSummaryAckOrNack,
					]);
					for (const newResult of newResults) {
						assert(newResult.success === true, "should succeed");
					}
				});

				it("Should fail an enqueue summarize attempt if stopping", async () => {
					summarizer.waitStop(true).catch(() => {});
					const result1 = summarizer.enqueueSummarize({ reason: "test1" });
					assert(result1.alreadyEnqueued === undefined, "should not be already enqueued");
					const result2 = summarizer.enqueueSummarize({
						reason: "test2",
						afterSequenceNumber: 123,
					});
					assert(result2.alreadyEnqueued === undefined, "should not be already enqueued");

					const allResults = await Promise.all([
						result1.summarySubmitted,
						result1.summaryOpBroadcasted,
						result1.receivedSummaryAckOrNack,
						result2.summarySubmitted,
						result2.summaryOpBroadcasted,
						result2.receivedSummaryAckOrNack,
					]);
					for (const result of allResults) {
						assert(!result.success, "all results should fail");
					}
				});

				it("Should fail an enqueue summarize attempt if disposed", async () => {
					summarizer.dispose();
					const result1 = summarizer.enqueueSummarize({ reason: "test1" });
					assert(result1.alreadyEnqueued === undefined, "should not be already enqueued");
					const result2 = summarizer.enqueueSummarize({
						reason: "test2",
						afterSequenceNumber: 123,
					});
					assert(result2.alreadyEnqueued === undefined, "should not be already enqueued");

					const allResults = await Promise.all([
						result1.summarySubmitted,
						result1.summaryOpBroadcasted,
						result1.receivedSummaryAckOrNack,
						result2.summarySubmitted,
						result2.summaryOpBroadcasted,
						result2.receivedSummaryAckOrNack,
					]);
					for (const result of allResults) {
						assert(!result.success, "all results should fail");
					}
				});
			});

			describe("Summary Start", () => {
				it("Should summarize immediately if summary ack is missing at startup", async () => {
					assertRunCounts(0, 0);
					// Simulate as summary op was in op stream.
					const summaryTimestamp = Date.now();
					emitBroadcast(summaryTimestamp);

					let startStatus: "starting" | "started" | "failed" = "starting";
					startRunningSummarizer().then(
						() => {
							startStatus = "started";
						},
						() => {
							startStatus = "failed";
						},
					);
					await flushPromises();
					assert.strictEqual(
						startStatus,
						"starting",
						"RunningSummarizer should still be starting since outstanding summary op",
					);

					// Still should be waiting
					await emitNextOp(1, summaryTimestamp + summaryConfig.maxAckWaitTime - 1);
					assert.strictEqual(
						startStatus,
						"starting",
						"RunningSummarizer should still be starting since timestamp is within maxAckWaitTime",
					);

					// Emit next op after maxAckWaitTime
					// clock.tick(summaryConfig.maxAckWaitTime + 1000);
					await emitNextOp(1, summaryTimestamp + summaryConfig.maxAckWaitTime);
					assert(
						mockLogger.matchEvents([{ eventName: "Running:MissingSummaryAckFoundByOps" }]),
						"unexpected log sequence 1",
					);

					assert.strictEqual(
						startStatus,
						"started",
						"RunningSummarizer should be started from the above op",
					);

					await emitNextOp(summaryConfig.maxOps + 1);
					assertRunCounts(1, 0, "Should run summarizer once");
					assert(
						mockLogger.matchEvents([
							{ eventName: "Running:Summarize_generate", summarizeCount: runCount },
							{ eventName: "Running:Summarize_Op", summarizeCount: runCount },
						]),
						"unexpected log sequence 2",
					);

					assert(
						!mockLogger.matchEvents([{ eventName: "Running:Summarize_end" }]),
						"No ack expected yet",
					);

					// Now emit ack
					await emitAck();
					assert(
						mockLogger.matchEvents([
							{
								eventName: "Running:Summarize_end",
								summarizeCount: runCount,
								summarizerSuccessfulAttempts: runCount,
								summarizeReason: "maxOps",
							},
						]),
						"unexpected log sequence 3",
					);
				});
			});

			describe("Disabled Heuristics", () => {
				it("Should not summarize after time or ops", async () => {
					await startRunningSummarizer(true /* disableHeuristics */);

					await emitNextOp(summaryConfig.maxOps + 1);
					assertRunCounts(0, 0, "should not summarize after maxOps");

					await tickAndFlushPromises(summaryConfig.minIdleTime + 1);
					assertRunCounts(0, 0, "should not summarize after minIdleTime");

					await tickAndFlushPromises(summaryConfig.maxTime + 1);
					assertRunCounts(0, 0, "should not summarize after maxTime");

					await emitNextOp(summaryConfig.maxOps * 3 + 10000);
					await tickAndFlushPromises(
						summaryConfig.maxTime * 3 + summaryConfig.minIdleTime * 3 + 10000,
					);
					assertRunCounts(0, 0, "make extra sure");
				});

				it("Should not summarize before closing", async () => {
					await startRunningSummarizer(true /* disableHeuristics */);

					await emitNextOp(summaryConfig.minOpsForLastSummaryAttempt);
					const stopP = summarizer.waitStop(true);
					await flushPromises();
					await emitAck();
					await stopP;

					assertRunCounts(0, 0, "should not perform lastSummary");
				});

				it("Should not summarize immediately if summary ack is missing at startup when disabled", async () => {
					assertRunCounts(0, 0);
					// Simulate as summary op was in op stream.
					const summaryTimestamp = Date.now();
					emitBroadcast(summaryTimestamp);

					let startStatus: "starting" | "started" | "failed" = "starting";
					startRunningSummarizer(true /* disableHeuristics */).then(
						() => {
							startStatus = "started";
						},
						() => {
							startStatus = "failed";
						},
					);
					await flushPromises();
					assert.strictEqual(
						startStatus,
						"starting",
						"RunningSummarizer should still be starting since outstanding summary op",
					);

					// Still should be waiting
					await emitNextOp(1, summaryTimestamp + summaryConfig.maxAckWaitTime - 1);
					assert.strictEqual(
						startStatus,
						"starting",
						"RunningSummarizer should still be starting since timestamp is within maxAckWaitTime",
					);

					// Emit next op after maxAckWaitTime
					// clock.tick(summaryConfig.maxAckWaitTime + 1000);
					await emitNextOp(1, summaryTimestamp + summaryConfig.maxAckWaitTime);
					assert(
						mockLogger.matchEvents([{ eventName: "Running:MissingSummaryAckFoundByOps" }]),
						"unexpected log sequence 1",
					);

					assert.strictEqual(
						startStatus,
						"started",
						"RunningSummarizer should be started from the above op",
					);

					await emitNextOp(summaryConfig.maxOps + 1);
					assertRunCounts(0, 0, "Should not run summarizer");
				});
			});

			describe("Summarize events", () => {
				/**
				 * Helper function that creates a promise that would resolve when "summarize" event is emitted.
				 */
				async function getSummarizeEventPromise() {
					return new Promise<ISummarizeEventProps>((resolve) => {
						const handler = (props: ISummarizeEventProps) => {
							summarizer.off("summarize", handler);
							resolve(props);
						};
						summarizer.on("summarize", handler);
					});
				}

				it("should emit summarize event with success result", async () => {
					await startRunningSummarizer();
					const summarizePromiseP = getSummarizeEventPromise();

					await emitNextOp(summaryConfig.maxOps + 1);
					await emitAck();

					const eventProps = await summarizePromiseP;
					assert.strictEqual(eventProps.result, "success");
					assert.strictEqual(eventProps.currentAttempt, 1);
					assert.strictEqual(eventProps.maxAttempts, defaultMaxAttempts);
				});

				it("should emit summarize event with failed result", async () => {
					await startRunningSummarizer();
					const summarizePromiseP = getSummarizeEventPromise();

					await emitNextOp(summaryConfig.maxOps + 1);
					await emitNack();

					const { error, ...eventProps } = await summarizePromiseP;
					assert.strictEqual(eventProps.result, "failure");
					assert.strictEqual(eventProps.currentAttempt, 1);
					assert.strictEqual(eventProps.maxAttempts, defaultMaxAttempts);
				});

				it("should emit summarize event with canceled result", async () => {
					await startRunningSummarizer(
						undefined /* disableHeuristics */,
						undefined /* submitSummaryCallback */,
						{
							cancelled: true,
							waitCancelled: new Promise(() => {}),
						},
					);
					const summarizePromiseP = getSummarizeEventPromise();

					await emitNextOp(summaryConfig.maxOps + 1);
					await emitNack();

					const eventProps = await summarizePromiseP;
					assert.strictEqual(eventProps.result, "canceled");
					assert.strictEqual(eventProps.currentAttempt, 1);
					assert.strictEqual(eventProps.maxAttempts, defaultMaxAttempts);
				});

				it("should emit summarize event for every attempt with nack failure", async () => {
					await startRunningSummarizer();
					const retryAfterSeconds = 5;
					let summarizePromiseP = getSummarizeEventPromise();

					await emitNextOp(summaryConfig.maxOps + 1);

					// Nack failures are attempted defaultMaxAttempts times. Each attempt should emit "summarize" event.
					for (let attemptNumber = 1; attemptNumber <= defaultMaxAttempts; attemptNumber++) {
						await emitNack(retryAfterSeconds);
						const { error, ...eventProps } = await summarizePromiseP;
						assert.strictEqual(eventProps.result, "failure");
						assert.strictEqual(eventProps.currentAttempt, attemptNumber);
						assert.strictEqual(eventProps.maxAttempts, defaultMaxAttempts);

						summarizePromiseP = getSummarizeEventPromise();

						// Wait for "retryAfterSeconds". The next attempt should start after this.
						await tickAndFlushPromises(retryAfterSeconds * 1000 + 1);
					}
				});

				it("should emit summarize event for every attempt with submit failure", async () => {
					const retryAfterSeconds = 5;
					// Callback that would result in summarization failed during submit.
					const submitSummaryCallback = async (): Promise<SubmitSummaryResult> => {
						const error = new RetriableSummaryError(
							`Fail summarization at base stage`,
							retryAfterSeconds,
						);
						const failedResult: Partial<SubmitSummaryResult> = {
							stage: "base",
							referenceSequenceNumber: lastRefSeq,
							minimumSequenceNumber: 0,
							error,
						};
						return failedResult as SubmitSummaryResult;
					};

					await startRunningSummarizer(
						undefined /* disableHeuristics */,
						submitSummaryCallback,
					);
					let summarizePromiseP = getSummarizeEventPromise();
					await emitNextOp(summaryConfig.maxOps + 1);

					// Submit failures are attempted defaultMaxAttemptsForSubmitFailures times.
					// Each attempt should emit "summarize" event.
					for (
						let attemptNumber = 1;
						attemptNumber <= defaultMaxAttemptsForSubmitFailures;
						attemptNumber++
					) {
						const { error, ...eventProps } = await summarizePromiseP;
						assert.strictEqual(eventProps.result, "failure");
						assert.strictEqual(eventProps.currentAttempt, attemptNumber);
						assert.strictEqual(eventProps.maxAttempts, defaultMaxAttemptsForSubmitFailures);
						summarizePromiseP = getSummarizeEventPromise();
						// Wait for "retryAfterSeconds". The next attempt should start after this.
						await tickAndFlushPromises(retryAfterSeconds * 1000 + 1);
					}
				});
			});
		});
	});
});
