/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "assert";
import sinon from "sinon";
import { Deferred } from "@fluidframework/common-utils";
import {
    ISequencedDocumentMessage,
    ISummaryAck,
    ISummaryConfiguration,
    ISummaryNack,
    ISummaryProposal,
    MessageType,
    SummaryType,
} from "@fluidframework/protocol-definitions";
import { MockLogger } from "@fluidframework/telemetry-utils";
import { MockDeltaManager } from "@fluidframework/test-runtime-utils";
import { neverCancelledSummaryToken } from "../runWhileConnectedCoordinator";
import { RunningSummarizer } from "../runningSummarizer";
import { ISummarizerOptions } from "../summarizerTypes";
import { SummaryCollection } from "../summaryCollection";
import { SummarizeHeuristicData } from "../summarizerHeuristics";

describe("Runtime", () => {
    describe("Summarization", () => {
        describe("RunningSummarizer", () => {
            let stopCall: number;
            let runCount: number;
            let fullTreeRunCount: number;
            let refreshLatestAckRunCount: number;
            let clock: sinon.SinonFakeTimers;
            let mockLogger: MockLogger;
            let mockDeltaManager: MockDeltaManager;
            let summaryCollection: SummaryCollection;
            let summarizer: RunningSummarizer;
            const summarizerClientId = "test";
            let lastRefSeq = 0;
            let lastClientSeq: number;
            let lastSummarySeq: number;
            const summaryConfig: ISummaryConfiguration = {
                idleTime: 5000, // 5 sec (idle)
                maxTime: 5000 * 12, // 1 min (active)
                maxOps: 1000, // 1k ops (active)
                maxAckWaitTime: 120000, // 2 min
            };
            let shouldDeferGenerateSummary: boolean = false;
            let deferGenerateSummary: Deferred<void> | undefined;

            const flushPromises = async () => new Promise((resolve) => process.nextTick(resolve));

            async function emitNextOp(increment: number = 1, timestamp: number = Date.now()) {
                lastRefSeq += increment;
                const op: Partial<ISequencedDocumentMessage> = {
                    sequenceNumber: lastRefSeq,
                    timestamp,
                };
                summarizer.handleOp(undefined, op as ISequencedDocumentMessage);
                mockDeltaManager.emit("op", op);
                await flushPromises();
            }

            function emitBroadcast(timestamp = Date.now()) {
                mockDeltaManager.emit("op",{
                    type: MessageType.Summarize,
                    clientId: summarizerClientId,
                    referenceSequenceNumber: lastRefSeq,
                    clientSequenceNumber: --lastClientSeq,
                    sequenceNumber: --lastSummarySeq,
                    contents: {
                        handle: "test-broadcast-handle",
                    },
                    timestamp,
                });
            }

            async function emitAck() {
                const summaryProposal: ISummaryProposal = {
                    summarySequenceNumber: lastSummarySeq,
                };
                const contents: ISummaryAck = {
                    handle: "test-ack-handle",
                    summaryProposal,
                };
                mockDeltaManager.emit("op", { contents, type: MessageType.SummaryAck });

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
                mockDeltaManager.emit("op", { contents, type: MessageType.SummaryNack });

                await flushPromises();
            }

            async function tickAndFlushPromises(ms: number) {
                clock.tick(ms);
                await flushPromises();
            }

            function assertRunCounts(
                expectedTotalRunCount: number,
                expectedFullTreeRunCount: number,
                expectedRefreshLatestAckRunCount: number,
                errorMessage?: string,
            ) {
                const errorPrefix = errorMessage ? `${errorMessage}: ` : "";
                assert.strictEqual(runCount, expectedTotalRunCount, `${errorPrefix}unexpected total run count`);
                assert.strictEqual(
                    fullTreeRunCount,
                    expectedFullTreeRunCount,
                    `${errorPrefix}unexpected fullTree count`);
                assert.strictEqual(
                    refreshLatestAckRunCount,
                    expectedRefreshLatestAckRunCount,
                    `${errorPrefix}unexpected refreshLatestAck count`);
            }

            const startRunningSummarizer = async (
                summarizerOptions?: Readonly<Partial<ISummarizerOptions>>,
            ): Promise<void> => {
                summarizer = await RunningSummarizer.start(
                    mockLogger,
                    summaryCollection.createWatcher(summarizerClientId),
                    summaryConfig,
                    // submitSummaryCallback
                    async (options) => {
                        runCount++;

                        const { fullTree = false, refreshLatestAck = false } = options;
                        if (fullTree) {
                            fullTreeRunCount++;
                        }
                        if (refreshLatestAck) {
                            refreshLatestAckRunCount++;
                        }

                        // immediate broadcast
                        emitBroadcast();

                        if (shouldDeferGenerateSummary) {
                            deferGenerateSummary = new Deferred<void>();
                            await deferGenerateSummary.promise;
                            deferGenerateSummary = undefined;
                        }
                        return {
                            stage: "submit",
                            referenceSequenceNumber: lastRefSeq,
                            generateDuration: 0,
                            uploadDuration: 0,
                            submitOpDuration: 0,
                            summaryTree: { type: SummaryType.Tree, tree: {} },
                            summaryStats: {
                                treeNodeCount: 0,
                                blobNodeCount: 0,
                                handleNodeCount: 0,
                                totalBlobSize: 0,
                                dataStoreCount: 0,
                                summarizedDataStoreCount: 0,
                                unreferencedBlobSize: 0,
                            },
                            handle: "test-handle",
                            clientSequenceNumber: lastClientSeq,
                            forcedFullTree: false,
                        } as const;
                    },
                    new SummarizeHeuristicData(0, { refSequenceNumber: 0, summaryTime: Date.now() }),
                    () => { },
                    summaryCollection,
                    neverCancelledSummaryToken,
                    // stopSummarizerCallback
                    (reason) => { stopCall++; },
                    summarizerOptions,
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
                refreshLatestAckRunCount = 0;
                lastRefSeq = 0;
                lastClientSeq = -1000; // negative/decrement for test
                lastSummarySeq = 0; // negative/decrement for test
                mockLogger = new MockLogger();
                mockDeltaManager = new MockDeltaManager();
                summaryCollection = new SummaryCollection(mockDeltaManager, mockLogger);
            });

            describe("Summary Schedule", () => {
                beforeEach(async () => {
                    await startRunningSummarizer();
                });

                it("Should summarize after configured number of ops when not pending", async () => {
                    await emitNextOp();

                    // too early, should not run yet
                    await emitNextOp(summaryConfig.maxOps - 1);
                    assertRunCounts(0, 0, 0);

                    // now should run
                    await emitNextOp(1);
                    assertRunCounts(1, 0, 0);
                    assert(mockLogger.matchEvents([
                        { eventName: "Running:Summarize_generate", summarizeCount: runCount },
                        { eventName: "Running:Summarize_Op", summarizeCount: runCount },
                    ]), "unexpected log sequence");

                    // should not run, because our summary hasnt been acked/nacked yet
                    await emitNextOp(summaryConfig.maxOps + 1);
                    assertRunCounts(1, 0, 0);

                    // should run, because another op has come in, and our summary has been acked
                    await emitAck();
                    assertRunCounts(2, 0, 0);
                    assert(mockLogger.matchEvents([
                        { eventName: "Running:Summarize_end", summarizeCount: (runCount - 1) }, // ack for previous run
                        { eventName: "Running:Summarize_generate", summarizeCount: runCount },
                        { eventName: "Running:Summarize_Op", summarizeCount: runCount },
                    ]), "unexpected log sequence");

                    await emitNextOp();
                    assertRunCounts(2, 0, 0);
                    assert(!mockLogger.matchEvents([
                        { eventName: "Running:Summarize_end" },
                    ]), "No ack expected yet");
                });

                it("Should summarize after configured idle time when not pending", async () => {
                    await emitNextOp();

                    // too early, should not run yet
                    await tickAndFlushPromises(summaryConfig.idleTime - 1);
                    assertRunCounts(0, 0, 0);

                    // now should run
                    await tickAndFlushPromises(1);
                    assertRunCounts(1, 0, 0);

                    // should not run, because our summary hasnt been acked/nacked yet
                    await emitNextOp();
                    await tickAndFlushPromises(summaryConfig.idleTime);
                    assertRunCounts(1, 0, 0);

                    // should run, because another op has come in, and our summary has been acked
                    await emitAck();
                    await emitNextOp();
                    await tickAndFlushPromises(summaryConfig.idleTime);
                    assertRunCounts(2, 0, 0);
                });

                it("Should summarize after configured active time when not pending", async () => {
                    const idlesPerActive = Math.floor((summaryConfig.maxTime + 1) / (summaryConfig.idleTime - 1));
                    const remainingTime = (summaryConfig.maxTime + 1) % (summaryConfig.idleTime - 1);
                    await emitNextOp();

                    // too early should not run yet
                    for (let i = 0; i < idlesPerActive; i++) {
                        // prevent idle from triggering with periodic ops
                        await tickAndFlushPromises(summaryConfig.idleTime - 1);
                        await emitNextOp();
                    }
                    await tickAndFlushPromises(remainingTime - 1);
                    await emitNextOp();
                    assertRunCounts(0, 0, 0);

                    // now should run
                    await tickAndFlushPromises(1);
                    await emitNextOp();
                    assertRunCounts(1, 0, 0);

                    // should not run because our summary hasnt been acked/nacked yet
                    for (let i = 0; i < idlesPerActive; i++) {
                        // prevent idle from triggering with periodic ops
                        await tickAndFlushPromises(summaryConfig.idleTime - 1);
                        await emitNextOp();
                    }
                    await tickAndFlushPromises(remainingTime);
                    await emitNextOp();
                    assertRunCounts(1, 0, 0);

                    // should run, because another op has come in, and our summary has been acked
                    await emitAck();
                    await emitNextOp();
                    assertRunCounts(2, 0, 0);
                });

                it("Should summarize after pending timeout", async () => {
                    // first run to start pending
                    await emitNextOp(summaryConfig.maxOps + 1);
                    assertRunCounts(1, 0, 0);

                    // should not run because still pending
                    await tickAndFlushPromises(summaryConfig.maxAckWaitTime - 1);
                    await emitNextOp(summaryConfig.maxOps + 1);
                    assertRunCounts(1, 0, 0);

                    // should run because pending timeout
                    await tickAndFlushPromises(1);
                    await emitNextOp();
                    assertRunCounts(2, 0, 1);

                    // verify subsequent ack works
                    await emitNextOp(summaryConfig.maxOps + 1);
                    assertRunCounts(2, 0, 1);
                    await emitAck();
                    await emitNextOp();
                    assertRunCounts(3, 0, 1);
                });

                it("Should not cause pending ack timeouts using older summary time", async () => {
                    shouldDeferGenerateSummary = true;
                    await emitNextOp();

                    // should do first summary fine
                    await emitNextOp(summaryConfig.maxOps);
                    assertRunCounts(1, 0, 0);
                    assert(deferGenerateSummary !== undefined, "submitSummary was not called");
                    deferGenerateSummary.resolve();
                    await emitAck();

                    // pass time that should not count towards the next max ack wait time
                    await tickAndFlushPromises(summaryConfig.maxAckWaitTime);

                    // subsequent summary should not cancel pending!
                    await emitNextOp(summaryConfig.maxOps + 1);
                    assertRunCounts(2, 0, 0);
                    await emitNextOp(); // fine
                    await tickAndFlushPromises(1); // next op will exceed maxAckWaitTime from first summary
                    await emitNextOp(); // not fine, nay cancel pending too soon
                    assert(deferGenerateSummary !== undefined, "submitSummary was not called");
                    deferGenerateSummary.resolve();

                    // we should not generate another summary without previous ack
                    await emitNextOp(); // flush finish summarizing
                    await emitNextOp(summaryConfig.maxOps + 1);
                    assertRunCounts(2, 0, 0);
                });

                it("Should summarize one last time before closing >50 ops", async () => {
                    await emitNextOp(51); // hard-coded to 50 for now
                    const stopP = summarizer.waitStop(true);
                    await flushPromises();
                    await emitAck();
                    await stopP;

                    assertRunCounts(1, 0, 0, "should perform lastSummary");
                });

                it("Should not summarize one last time before closing <=50 ops", async () => {
                    await emitNextOp(50); // hard-coded to 50 for now
                    const stopP = summarizer.waitStop(true);
                    await flushPromises();
                    await emitAck();
                    await stopP;

                    assertRunCounts(0, 0, 0, "should not perform lastSummary");
                });
            });

            describe("Safe Retries", () => {
                beforeEach(async () => {
                    shouldDeferGenerateSummary = false;
                    deferGenerateSummary = undefined;
                    await startRunningSummarizer();
                });

                it("Should retry on failures", async () => {
                    await emitNextOp();

                    // too early, should not run yet
                    await emitNextOp(summaryConfig.maxOps - 1);
                    assertRunCounts(0, 0, 0);

                    // now should run a normal run
                    await emitNextOp(1);
                    assertRunCounts(1, 0, 0);
                    const retryProps1 = {
                        summarizeCount: 1,
                        summaryAttemptsPerPhase: 1,
                        summaryAttempts: 1,
                        summaryAttemptPhase: 1,
                    };
                    assert(mockLogger.matchEvents([
                        { eventName: "Running:Summarize_generate", ...retryProps1 },
                        { eventName: "Running:Summarize_Op", ...retryProps1 },
                    ]), "unexpected log sequence");

                    // should not run, because our summary hasn't been acked/nacked yet
                    await emitNextOp(summaryConfig.maxOps + 1);
                    assertRunCounts(1, 0, 0);

                    // should run with refresh after first nack
                    await emitNack();
                    assertRunCounts(2, 0, 1, "retry1 should be refreshLatestAck");
                    const retryProps2 = {
                        summarizeCount: 1,
                        summaryAttemptsPerPhase: 1,
                        summaryAttempts: 2,
                        summaryAttemptPhase: 2,
                    };
                    assert(mockLogger.matchEvents([
                        { eventName: "Running:Summarize_cancel", ...retryProps1, reason: "summaryNack" },
                        { eventName: "Running:Summarize_generate", ...retryProps2 },
                        { eventName: "Running:Summarize_Op", ...retryProps2 },
                    ]), "unexpected log sequence");

                    // Should not run, because of 2 min delay
                    await emitNack();
                    await tickAndFlushPromises(2 * 60 * 1000 - 1);
                    assertRunCounts(2, 0, 1, "retry2 should not start until after delay");

                    // Should run with refreshLatestAck after second nack
                    await tickAndFlushPromises(1);
                    assertRunCounts(3, 0, 2, "retry2 should be refreshLatestAck");
                    const retryProps3 = {
                        summarizeCount: 1,
                        summaryAttemptsPerPhase: 1,
                        summaryAttempts: 3,
                        summaryAttemptPhase: 3,
                    };
                    assert(mockLogger.matchEvents([
                        { eventName: "Running:Summarize_cancel", ...retryProps2, reason: "summaryNack" },
                        { eventName: "Running:Summarize_generate", ...retryProps3 },
                        { eventName: "Running:Summarize_Op", ...retryProps3 },
                    ]), "unexpected log sequence");

                    // Should not run, because of 10 min delay
                    await emitNack();
                    await tickAndFlushPromises(10 * 60 * 1000 - 1);
                    assertRunCounts(3, 0, 2, "retry3 should not start until after delay");

                    // Should run with fullTree after third nack
                    await tickAndFlushPromises(1);
                    assertRunCounts(4, 1, 3, "retry3 should be fullTree and refreshLatestAck");
                    const retryProps4 = {
                        summarizeCount: 1,
                        summaryAttemptsPerPhase: 1,
                        summaryAttempts: 4,
                        summaryAttemptPhase: 4,
                    };
                    assert(mockLogger.matchEvents([
                        { eventName: "Running:Summarize_cancel", ...retryProps3, reason: "summaryNack" },
                        { eventName: "Running:Summarize_generate", ...retryProps4 },
                        { eventName: "Running:Summarize_Op", ...retryProps4 },
                    ]), "unexpected log sequence");

                    // Should stop after final nack
                    assert.strictEqual(stopCall, 0);
                    await emitNack();
                    assert.strictEqual(stopCall, 1);
                });

                it("Should retry after delay on failures with retryAfter", async () => {
                    await emitNextOp();

                    // too early, should not run yet
                    await emitNextOp(summaryConfig.maxOps - 1);
                    assertRunCounts(0, 0, 0, "too early");

                    // now should run a normal run
                    await emitNextOp(1);
                    assertRunCounts(1, 0, 0, "normal run");
                    const retryProps1 = {
                        summarizeCount: 1,
                        summaryAttemptsPerPhase: 1,
                        summaryAttempts: 1,
                        summaryAttemptPhase: 1,
                    };
                    assert(mockLogger.matchEvents([
                        { eventName: "Running:Summarize_generate", ...retryProps1 },
                        { eventName: "Running:Summarize_Op", ...retryProps1 },
                    ]), "unexpected log sequence");

                    // should not run, because our summary hasn't been acked/nacked yet
                    await emitNextOp(summaryConfig.maxOps + 1);
                    assertRunCounts(1, 0, 0, "waiting for ack/nack");

                    // should not run, because of specified 30 sec delay
                    await emitNack(30);
                    await tickAndFlushPromises(30 * 1000 - 1);
                    assertRunCounts(1, 0, 0, "waiting for retryAfter delay");

                    // should rerun the normal try after the delay
                    await tickAndFlushPromises(1);
                    assertRunCounts(2, 0, 0, "rerun after retryAfter delay");
                    const retryProps2 = {
                        summarizeCount: 1,
                        summaryAttemptsPerPhase: 2,
                        summaryAttempts: 2,
                        summaryAttemptPhase: 1,
                    };
                    assert(mockLogger.matchEvents([
                        { eventName: "Running:Summarize_cancel", summarizeCount: 1, reason: "summaryNack" },
                        { eventName: "Running:SummarizeAttemptDelay", ...retryProps2 },
                        { eventName: "Running:Summarize_generate", ...retryProps2 },
                        { eventName: "Running:Summarize_Op", ...retryProps2 },
                    ]), "unexpected log sequence");

                    // should not run, because of specified 30 sec delay
                    await emitNack(30);
                    await tickAndFlushPromises(30 * 1000 - 1);
                    assertRunCounts(2, 0, 0, "wait for another retryAfter delay");

                    // should run the next stage with refreshLatestAck after delay
                    await tickAndFlushPromises(1);
                    assertRunCounts(3, 0, 1, "retry again with refreshLatestAck");
                    const retryProps3 = {
                        summarizeCount: 1,
                        summaryAttemptsPerPhase: 1,
                        summaryAttempts: 3,
                        summaryAttemptPhase: 2,
                    };
                    assert(mockLogger.matchEvents([
                        { eventName: "Running:Summarize_cancel", ...retryProps2, reason: "summaryNack" },
                        { eventName: "Running:SummarizeAttemptDelay", ...retryProps3 },
                        { eventName: "Running:Summarize_generate", ...retryProps3 },
                        { eventName: "Running:Summarize_Op", ...retryProps3 },
                    ]), "unexpected log sequence");
                });

                it("Should wait on 429 from uploadSummaryWithContext", async () => {
                    shouldDeferGenerateSummary = true;
                    await emitNextOp();

                    // too early, should not run yet
                    await emitNextOp(summaryConfig.maxOps);
                    assert(deferGenerateSummary !== undefined, "submitSummary was not called");
                    deferGenerateSummary.reject({ message: "error", retryAfterSeconds: 30 });

                    await flushPromises();
                    await tickAndFlushPromises(30 * 1000 - 1);

                    assertRunCounts(1, 0, 0, "failed upload");
                    const retryProps1 = {
                        summarizeCount: 1,
                        summaryAttemptsPerPhase: 1,
                        summaryAttempts: 1,
                        summaryAttemptPhase: 1,
                     };
                    const retryProps2 = {
                        summarizeCount: 1,
                        summaryAttemptsPerPhase: 2,
                        summaryAttempts: 2,
                        summaryAttemptPhase: 1,
                    };
                    assert(mockLogger.matchEvents([
                        { eventName: "Running:Summarize_cancel", ...retryProps1 },
                        { eventName: "Running:SummarizeAttemptDelay", ...retryProps2 },
                    ]), "unexpected log sequence");

                    shouldDeferGenerateSummary = false;
                    await tickAndFlushPromises(1);
                    assertRunCounts(2, 0, 0, "normal run");

                    assert(mockLogger.matchEvents([
                        { eventName: "Running:Summarize_generate", ...retryProps2 },
                        { eventName: "Running:Summarize_Op", ...retryProps2 },
                    ]), "unexpected log sequence");
                });
            });

            describe("On-demand Summaries", () => {
                beforeEach(async () => {
                    await startRunningSummarizer();
                });

                it("Should create an on-demand summary", async () => {
                    await emitNextOp(2); // set ref seq to 2
                    const result = summarizer.summarizeOnDemand(undefined, { reason: "test" });

                    const submitResult = await result.summarySubmitted;
                    assertRunCounts(1, 0, 0, "on-demand should run");

                    assert(submitResult.success, "on-demand summary should submit");
                    assert(submitResult.data.stage === "submit",
                        "on-demand summary submitted data stage should be submit");

                    assert.strictEqual(submitResult.data.referenceSequenceNumber, 2, "ref seq num");
                    assert(submitResult.data.summaryTree !== undefined, "summary tree should exist");

                    const broadcastResult = await result.summaryOpBroadcasted;
                    assert(broadcastResult.success, "summary op should be broadcast");
                    assert.strictEqual(broadcastResult.data.summarizeOp.referenceSequenceNumber, 2,
                        "summarize op ref seq num should be same as summary seq");
                    assert.strictEqual(broadcastResult.data.summarizeOp.sequenceNumber, -1,
                        "summarize op seq number should match test negative counter");
                    assert.strictEqual(broadcastResult.data.summarizeOp.contents.handle, "test-broadcast-handle",
                        "summarize op handle should be test-broadcast-handle");

                    assert(mockLogger.matchEvents([
                        { eventName: "Running:Summarize_generate", summarizeCount: runCount },
                        { eventName: "Running:Summarize_Op", summarizeCount: runCount },
                    ]), "unexpected log sequence");

                    // Verify that heuristics are blocked while waiting for ack
                    await emitNextOp(summaryConfig.maxOps + 1);
                    assertRunCounts(1, 0, 0);

                    await emitAck();
                    const ackNackResult = await result.receivedSummaryAckOrNack;
                    assert(ackNackResult.success, "on-demand summary should succeed");
                    assert(ackNackResult.data.summaryAckOp.type === MessageType.SummaryAck,
                        "should be ack");
                    assert(ackNackResult.data.summaryAckOp.contents.handle === "test-ack-handle",
                        "summary ack handle should be test-ack-handle");
                });

                it("Should return already running for on-demand summary", async () => {
                    // Should start running by heuristics
                    await emitNextOp(summaryConfig.maxOps + 1);
                    assertRunCounts(1, 0, 0);

                    let resolved = false;
                    try {
                        summarizer.summarizeOnDemand(undefined, { reason: "test" });
                        resolved = true;
                    }
                    catch {}

                    await flushPromises();
                    assert(resolved === false, "already running promise should not resolve yet");
                });

                it("On-demand summary should fail on nack", async () => {
                    await emitNextOp(2); // set ref seq to 2
                    const result = summarizer.summarizeOnDemand(undefined, { reason: "test" });

                    const submitResult = await result.summarySubmitted;
                    assertRunCounts(1, 0, 0, "on-demand should run");

                    assert(submitResult.success, "on-demand summary should submit");
                    assert(submitResult.data.stage === "submit",
                        "on-demand summary submitted data stage should be submit");

                    assert.strictEqual(submitResult.data.referenceSequenceNumber, 2, "ref seq num");
                    assert(submitResult.data.summaryTree !== undefined, "summary tree should exist");

                    const broadcastResult = await result.summaryOpBroadcasted;
                    assert(broadcastResult.success, "summary op should be broadcast");
                    assert.strictEqual(broadcastResult.data.summarizeOp.referenceSequenceNumber, 2,
                        "summarize op ref seq num should be same as summary seq");
                    assert.strictEqual(broadcastResult.data.summarizeOp.sequenceNumber, -1,
                        "summarize op seq number should match test negative counter");
                    assert.strictEqual(broadcastResult.data.summarizeOp.contents.handle, "test-broadcast-handle",
                        "summarize op handle should be test-broadcast-handle");

                    assert(mockLogger.matchEvents([
                        { eventName: "Running:Summarize_generate", summarizeCount: runCount },
                        { eventName: "Running:Summarize_Op", summarizeCount: runCount },
                    ]), "unexpected log sequence");

                    // Verify that heuristics are blocked while waiting for ack
                    await emitNextOp(summaryConfig.maxOps + 1);
                    assertRunCounts(1, 0, 0);

                    await emitNack();
                    const ackNackResult = await result.receivedSummaryAckOrNack;
                    assert(!ackNackResult.success, "on-demand summary should fail");
                    assert(ackNackResult.data?.summaryNackOp.type === MessageType.SummaryNack,
                        "should be nack");
                    assert(ackNackResult.data.summaryNackOp.contents.message === "test-nack",
                        "summary nack error should be test-nack");
                });

                it("Should fail an on-demand summary if stopping", async () => {
                    summarizer.waitStop(true).catch(() => {});
                    const [refreshLatestAck, fullTree] = [true, true];
                    const result1 = summarizer.summarizeOnDemand(undefined, { reason: "test1" });
                    const result2 = summarizer.summarizeOnDemand(undefined, { reason: "test2", refreshLatestAck });
                    const result3 = summarizer.summarizeOnDemand(undefined, { reason: "test3", fullTree });
                    const result4 = summarizer.summarizeOnDemand(
                        undefined, { reason: "test4", refreshLatestAck, fullTree });

                    const allResults = (await Promise.all([
                        result1.summarySubmitted,
                        result1.summaryOpBroadcasted,
                        result1.receivedSummaryAckOrNack,
                        result2.summarySubmitted,
                        result2.summaryOpBroadcasted,
                        result2.receivedSummaryAckOrNack,
                    ])).concat(await Promise.all([
                        result3.summarySubmitted,
                        result3.summaryOpBroadcasted,
                        result3.receivedSummaryAckOrNack,
                        result4.summarySubmitted,
                        result4.summaryOpBroadcasted,
                        result4.receivedSummaryAckOrNack,
                    ]));
                    for (const result of allResults) {
                        assert(!result.success, "all results should fail");
                    }
                });

                it("Should fail an on-demand summary if disposed", async () => {
                    summarizer.dispose();
                    const [refreshLatestAck, fullTree] = [true, true];
                    const result1 = summarizer.summarizeOnDemand(undefined, { reason: "test1" });
                    const result2 = summarizer.summarizeOnDemand(undefined, { reason: "test2", refreshLatestAck });
                    const result3 = summarizer.summarizeOnDemand(undefined, { reason: "test3", fullTree });
                    const result4 = summarizer.summarizeOnDemand(
                        undefined, { reason: "test4", refreshLatestAck, fullTree });

                    const allResults = (await Promise.all([
                        result1.summarySubmitted,
                        result1.summaryOpBroadcasted,
                        result1.receivedSummaryAckOrNack,
                        result2.summarySubmitted,
                        result2.summaryOpBroadcasted,
                        result2.receivedSummaryAckOrNack,
                    ])).concat(await Promise.all([
                        result3.summarySubmitted,
                        result3.summaryOpBroadcasted,
                        result3.receivedSummaryAckOrNack,
                        result4.summarySubmitted,
                        result4.summaryOpBroadcasted,
                        result4.receivedSummaryAckOrNack,
                    ]));
                    for (const result of allResults) {
                        assert(!result.success, "all results should fail");
                    }
                });
            });

            describe("Enqueue Summaries", () => {
                beforeEach(async () => {
                    await startRunningSummarizer();
                });

                it("Should summarize after specified sequence number", async () => {
                    await emitNextOp(2); // set ref seq to 2
                    const afterSequenceNumber = 9;
                    const result = summarizer.enqueueSummarize({ reason: "test", afterSequenceNumber });
                    assert(result.alreadyEnqueued === undefined, "should not be already enqueued");

                    await emitNextOp(6);
                    assertRunCounts(0, 0, 0, "enqueued should not run yet, still 1 op short");

                    await emitNextOp(1);
                    assertRunCounts(1, 0, 0, "enqueued should run");

                    const submitResult = await result.summarySubmitted;
                    assert(submitResult.success, "enqueued summary should submit");
                    assert(submitResult.data.stage === "submit",
                        "enqueued summary submitted data stage should be submit");

                    assert.strictEqual(submitResult.data.referenceSequenceNumber, 9, "ref seq num");
                    assert(submitResult.data.summaryTree !== undefined, "summary tree should exist");

                    const broadcastResult = await result.summaryOpBroadcasted;
                    assert(broadcastResult.success, "summary op should be broadcast");
                    assert.strictEqual(broadcastResult.data.summarizeOp.referenceSequenceNumber, 9,
                        "summarize op ref seq num should be same as summary seq");
                    assert.strictEqual(broadcastResult.data.summarizeOp.sequenceNumber, -1,
                        "summarize op seq number should match test negative counter");
                    assert.strictEqual(broadcastResult.data.summarizeOp.contents.handle, "test-broadcast-handle",
                        "summarize op handle should be test-broadcast-handle");

                    assert(mockLogger.matchEvents([
                        { eventName: "Running:Summarize_generate", summarizeCount: runCount },
                        { eventName: "Running:Summarize_Op", summarizeCount: runCount },
                    ]), "unexpected log sequence");

                    // Verify that heuristics are blocked while waiting for ack
                    await emitNextOp(summaryConfig.maxOps + 1);
                    assertRunCounts(1, 0, 0);

                    await emitAck();
                    const ackNackResult = await result.receivedSummaryAckOrNack;
                    assert(ackNackResult.success, "enqueued summary should succeed");
                    assert(ackNackResult.data.summaryAckOp.type === MessageType.SummaryAck,
                        "should be ack");
                    assert(ackNackResult.data.summaryAckOp.contents.handle === "test-ack-handle",
                        "summary ack handle should be test-ack-handle");
                });

                it("Should summarize after specified sequence number after heuristics attempt finishes", async () => {
                    const afterSequenceNumber = summaryConfig.maxOps * 2 + 10;

                    // Should start running by heuristics
                    await emitNextOp(summaryConfig.maxOps + 1);
                    assertRunCounts(1, 0, 0);

                    const result = summarizer.enqueueSummarize({ reason: "test", afterSequenceNumber });
                    assert(result.alreadyEnqueued === undefined, "should not be already enqueued");
                    let submitRan = false;
                    result.summarySubmitted.then(() => { submitRan = true; }, () => {});

                    // Even after finishing first heuristic summary, enqueued shouldn't run yet.
                    await emitAck();

                    // Should start running by heuristics again.
                    await emitNextOp(summaryConfig.maxOps + 1);
                    assertRunCounts(2, 0, 0);
                    await emitNextOp(20); // make sure enqueued is ready
                    assert(submitRan === false, "enqueued summary should not run until 2nd heuristic ack");

                    // After this ack, it should start running enqueued summary.
                    await emitAck();
                    assert((submitRan as boolean) === true, "enqueued summary should run");
                    assertRunCounts(3, 0, 0);

                    const submitResult = await result.summarySubmitted;
                    assert(submitResult.success, "enqueued summary should submit");
                    assert(submitResult.data.stage === "submit",
                        "enqueued summary submitted data stage should be submit");

                    const expectedRefSeqNum = summaryConfig.maxOps * 2 + 22;
                    assert.strictEqual(submitResult.data.referenceSequenceNumber, expectedRefSeqNum, "ref seq num");
                    assert(submitResult.data.summaryTree !== undefined, "summary tree should exist");

                    const broadcastResult = await result.summaryOpBroadcasted;
                    assert(broadcastResult.success, "summary op should be broadcast");
                    assert.strictEqual(broadcastResult.data.summarizeOp.referenceSequenceNumber, expectedRefSeqNum,
                        "summarize op ref seq num should be same as summary seq");
                    assert.strictEqual(broadcastResult.data.summarizeOp.sequenceNumber, -3,
                        "summarize op seq number should match test negative counter");
                    assert.strictEqual(broadcastResult.data.summarizeOp.contents.handle, "test-broadcast-handle",
                        "summarize op handle should be test-broadcast-handle");

                    // Verify that heuristics are blocked while waiting for ack
                    await emitNextOp(summaryConfig.maxOps + 1);
                    assertRunCounts(3, 0, 0);

                    await emitAck();
                    const ackNackResult = await result.receivedSummaryAckOrNack;
                    assert(ackNackResult.success, "enqueued summary should succeed");
                    assert(ackNackResult.data.summaryAckOp.type === MessageType.SummaryAck,
                        "should be ack");
                    assert(ackNackResult.data.summaryAckOp.contents.handle === "test-ack-handle",
                        "summary ack handle should be test-ack-handle");
                });

                it("Should reject subsequent enqueued summarize attempt unless overridden", async () => {
                    await emitNextOp(2); // set ref seq to 2
                    const afterSequenceNumber = 9;
                    const result = summarizer.enqueueSummarize({ reason: "test", afterSequenceNumber });
                    assert(result.alreadyEnqueued === undefined, "should not be already enqueued");

                    // While first attempt is still enqueued, it should reject subsequent ones
                    const result2 = summarizer.enqueueSummarize({ reason: "test-fail" });
                    assert(result2.alreadyEnqueued === true, "should be already enqueued");
                    assert(result2.overridden === undefined, "should not be overridden");

                    const result3 = summarizer.enqueueSummarize({ reason: "test-override", override: true });
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
                    const result2 = summarizer.enqueueSummarize({ reason: "test2", afterSequenceNumber: 123 });
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
                    const result2 = summarizer.enqueueSummarize({ reason: "test2", afterSequenceNumber: 123 });
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
                    assertRunCounts(0, 0, 0);
                    // Simulate as summary op was in op stream.
                    const summaryTimestamp = Date.now();
                    emitBroadcast(summaryTimestamp);

                    let startStatus: "starting" | "started" | "failed" = "starting";
                    startRunningSummarizer().then(
                        () => { startStatus = "started"; },
                        () => { startStatus = "failed"; },
                    );
                    await flushPromises();
                    assert.strictEqual(startStatus, "starting",
                        "RunningSummarizer should still be starting since outstanding summary op");

                    // Still should be waiting
                    await emitNextOp(1, summaryTimestamp + summaryConfig.maxAckWaitTime - 1);
                    assert.strictEqual(startStatus, "starting",
                        "RunningSummarizer should still be starting since timestamp is within maxAckWaitTime");

                    // Emit next op after maxAckWaitTime
                    // clock.tick(summaryConfig.maxAckWaitTime + 1000);
                    await emitNextOp(1, summaryTimestamp + summaryConfig.maxAckWaitTime);
                    assert(mockLogger.matchEvents([
                        { eventName: "Running:MissingSummaryAckFoundByOps" },
                    ]), "unexpected log sequence 1");

                    assert.strictEqual(startStatus, "started",
                        "RunningSummarizer should be started from the above op");

                    await emitNextOp(summaryConfig.maxOps + 1);
                    assertRunCounts(1, 0, 0, "Should run summarizer once");
                    assert(mockLogger.matchEvents([
                        { eventName: "Running:Summarize_generate", summarizeCount: runCount },
                        { eventName: "Running:Summarize_Op", summarizeCount: runCount },
                    ]), "unexpected log sequence 2");

                    assert(!mockLogger.matchEvents([
                        { eventName: "Running:Summarize_end" },
                    ]), "No ack expected yet");

                    // Now emit ack
                    await emitAck();
                    assert(mockLogger.matchEvents([
                        {
                            eventName: "Running:Summarize_end",
                            summarizeCount: runCount,
                            summarizerSuccessfulAttempts: runCount,
                            summarizeReason: "maxOps",
                        },
                    ]), "unexpected log sequence 3");
                });
            });

            describe("Disabled Heuristics", () => {
                it("Should not summarize after time or ops", async () => {
                    await startRunningSummarizer({ disableHeuristics: true });

                    await emitNextOp(summaryConfig.maxOps + 1);
                    assertRunCounts(0, 0, 0, "should not summarize after maxOps");

                    await tickAndFlushPromises(summaryConfig.idleTime + 1);
                    assertRunCounts(0, 0, 0, "should not summarize after idleTime");

                    await tickAndFlushPromises(summaryConfig.maxTime + 1);
                    assertRunCounts(0, 0, 0, "should not summarize after maxTime");

                    await emitNextOp(summaryConfig.maxOps * 3 + 10000);
                    await tickAndFlushPromises(summaryConfig.maxTime * 3 + summaryConfig.idleTime * 3 + 10000);
                    assertRunCounts(0, 0, 0, "make extra sure");
                });

                it("Should not summarize before closing", async () => {
                    await startRunningSummarizer({ disableHeuristics: true });

                    await emitNextOp(51); // hard-coded to 50 for now
                    const stopP = summarizer.waitStop(true);
                    await flushPromises();
                    await emitAck();
                    await stopP;

                    assertRunCounts(0, 0, 0, "should not perform lastSummary");
                });

                it("Should not summarize immediately if summary ack is missing at startup when disabled", async () => {
                    assertRunCounts(0, 0, 0);
                    // Simulate as summary op was in op stream.
                    const summaryTimestamp = Date.now();
                    emitBroadcast(summaryTimestamp);

                    let startStatus: "starting" | "started" | "failed" = "starting";
                    startRunningSummarizer({ disableHeuristics: true })
                        .then(
                            () => { startStatus = "started"; },
                            () => { startStatus = "failed"; },
                        );
                    await flushPromises();
                    assert.strictEqual(startStatus, "starting",
                        "RunningSummarizer should still be starting since outstanding summary op");

                    // Still should be waiting
                    await emitNextOp(1, summaryTimestamp + summaryConfig.maxAckWaitTime - 1);
                    assert.strictEqual(startStatus, "starting",
                        "RunningSummarizer should still be starting since timestamp is within maxAckWaitTime");

                    // Emit next op after maxAckWaitTime
                    // clock.tick(summaryConfig.maxAckWaitTime + 1000);
                    await emitNextOp(1, summaryTimestamp + summaryConfig.maxAckWaitTime);
                    assert(mockLogger.matchEvents([
                        { eventName: "Running:MissingSummaryAckFoundByOps" },
                    ]), "unexpected log sequence 1");

                    assert.strictEqual(startStatus, "started",
                        "RunningSummarizer should be started from the above op");

                    await emitNextOp(summaryConfig.maxOps + 1);
                    assertRunCounts(0, 0, 0, "Should not run summarizer");
                });
            });
        });
    });
});
