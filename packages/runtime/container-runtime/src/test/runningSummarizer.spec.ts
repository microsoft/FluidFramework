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
    ISummaryProposal,
    MessageType,
} from "@fluidframework/protocol-definitions";
import { MockDeltaManager, MockLogger } from "@fluidframework/test-runtime-utils";
import { RunningSummarizer } from "../runningSummarizer";
import { SummarizerStopReason } from "../summarizer";
import { SummaryCollection } from "../summaryCollection";

describe("Runtime", () => {
    describe("Container Runtime", () => {
        describe("RunningSummarizer", () => {
            let runCount: number;
            let clock: sinon.SinonFakeTimers;
            let mockLogger: MockLogger;
            let mockDeltaManager: MockDeltaManager;
            let summaryCollection: SummaryCollection;
            let summarizer: RunningSummarizer;
            const summarizerClientId = "test";
            const onBehalfOfClientId = "behalf";
            let lastRefSeq = 0;
            let lastClientSeq = -1000; // negative/decrement for test
            let lastSummarySeq = 0; // negative/decrement for test
            const summaryConfig: ISummaryConfiguration = {
                idleTime: 5000, // 5 sec (idle)
                maxTime: 5000 * 12, // 1 min (active)
                maxOps: 1000, // 1k ops (active)
                maxAckWaitTime: 120000, // 2 min
            };
            let shouldDeferGenerateSummary: boolean = false;
            let deferGenerateSummary: Deferred<void>;

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

            async function emitAck(type: MessageType = MessageType.SummaryAck) {
                const summaryProposal: ISummaryProposal = {
                    summarySequenceNumber: lastSummarySeq,
                };
                const contents: ISummaryAck = {
                    handle: "test-ack-handle",
                    summaryProposal,
                };
                mockDeltaManager.emit("op", { contents, type });

                await flushPromises(); // let summarize run
            }

            async function tickAndFlushPromises(ms: number) {
                clock.tick(ms);
                await flushPromises();
            }

            const startRunningSummarizer = async (): Promise<void> => {
                summarizer = await RunningSummarizer.start(
                    summarizerClientId,
                    onBehalfOfClientId,
                    mockLogger,
                    summaryCollection.createWatcher(summarizerClientId),
                    summaryConfig,
                    {
                        generateSummary: async () => {
                            runCount++;

                            // immediate broadcast
                            emitBroadcast();

                            if (shouldDeferGenerateSummary) {
                                deferGenerateSummary = new Deferred<void>();
                                await deferGenerateSummary.promise;
                            }
                            return {
                                stage: "submitted",
                                referenceSequenceNumber: lastRefSeq,
                                generateDuration: 0,
                                uploadDuration: 0,
                                submitOpDuration: 0,
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
                            } as const;
                        },
                        stop(reason?: SummarizerStopReason) {
                            // do nothing
                        },
                    },
                    0,
                    { refSequenceNumber: 0, summaryTime: Date.now() },
                    () => { },
                    summaryCollection,
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
                clock.reset();
                runCount = 0;
                lastRefSeq = 0;
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
                    assert.strictEqual(runCount, 0);

                    // now should run
                    await emitNextOp(1);
                    assert.strictEqual(runCount, 1);
                    assert(mockLogger.matchEvents([
                        { eventName: "Running:GenerateSummary", summaryGenTag: runCount },
                        { eventName: "Running:SummaryOp", summaryGenTag: runCount },
                    ]), "unexpected log sequence");

                    // should not run, because our summary hasnt been acked/nacked yet
                    await emitNextOp(summaryConfig.maxOps + 1);
                    assert.strictEqual(runCount, 1);

                    // should run, because another op has come in, and our summary has been acked
                    await emitAck();
                    assert.strictEqual(runCount, 2);
                    assert(mockLogger.matchEvents([
                        { eventName: "Running:Summarize_end", summaryGenTag: (runCount - 1) }, // ack for previous run
                        { eventName: "Running:GenerateSummary", summaryGenTag: runCount },
                        { eventName: "Running:SummaryOp", summaryGenTag: runCount },
                    ]), "unexpected log sequence");

                    await emitNextOp();
                    assert.strictEqual(runCount, 2);
                    assert(!mockLogger.matchEvents([
                        { eventName: "Running:Summarize_end" },
                    ]), "No ack expected yet");
                });

                it("Should summarize after configured idle time when not pending", async () => {
                    await emitNextOp();

                    // too early, should not run yet
                    await tickAndFlushPromises(summaryConfig.idleTime - 1);
                    assert.strictEqual(runCount, 0);

                    // now should run
                    await tickAndFlushPromises(1);
                    assert.strictEqual(runCount, 1);

                    // should not run, because our summary hasnt been acked/nacked yet
                    await emitNextOp();
                    await tickAndFlushPromises(summaryConfig.idleTime);
                    assert.strictEqual(runCount, 1);

                    // should run, because another op has come in, and our summary has been acked
                    await emitAck();
                    await emitNextOp();
                    await tickAndFlushPromises(summaryConfig.idleTime);
                    assert.strictEqual(runCount, 2);
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
                    assert.strictEqual(runCount, 0);

                    // now should run
                    await tickAndFlushPromises(1);
                    await emitNextOp();
                    assert.strictEqual(runCount, 1);

                    // should not run because our summary hasnt been acked/nacked yet
                    for (let i = 0; i < idlesPerActive; i++) {
                        // prevent idle from triggering with periodic ops
                        await tickAndFlushPromises(summaryConfig.idleTime - 1);
                        await emitNextOp();
                    }
                    await tickAndFlushPromises(remainingTime);
                    await emitNextOp();
                    assert.strictEqual(runCount, 1);

                    // should run, because another op has come in, and our summary has been acked
                    await emitAck();
                    await emitNextOp();
                    assert.strictEqual(runCount, 2);
                });

                it("Should summarize after pending timeout", async () => {
                    // first run to start pending
                    await emitNextOp(summaryConfig.maxOps + 1);
                    assert.strictEqual(runCount, 1);

                    // should not run because still pending
                    await tickAndFlushPromises(summaryConfig.maxAckWaitTime - 1);
                    await emitNextOp(summaryConfig.maxOps + 1);
                    assert.strictEqual(runCount, 1);

                    // should run because pending timeout
                    await tickAndFlushPromises(1);
                    await emitNextOp();
                    assert.strictEqual(runCount, 2);

                    // verify subsequent ack works
                    await emitNextOp(summaryConfig.maxOps + 1);
                    assert.strictEqual(runCount, 2);
                    await emitAck();
                    await emitNextOp();
                    assert.strictEqual(runCount, 3);
                });

                it("Should not cause pending ack timeouts using older summary time", async () => {
                    shouldDeferGenerateSummary = true;
                    await emitNextOp();

                    // should do first summary fine
                    await emitNextOp(summaryConfig.maxOps);
                    assert.strictEqual(runCount, 1);
                    deferGenerateSummary.resolve();
                    await emitAck();

                    // pass time that should not count towards the next max ack wait time
                    await tickAndFlushPromises(summaryConfig.maxAckWaitTime);

                    // subsequent summary should not cancel pending!
                    await emitNextOp(summaryConfig.maxOps + 1);
                    assert.strictEqual(runCount, 2);
                    await emitNextOp(); // fine
                    await tickAndFlushPromises(1); // next op will exceed maxAckWaitTime from first summary
                    await emitNextOp(); // not fine, nay cancel pending too soon
                    deferGenerateSummary.resolve();

                    // we should not generate another summary without previous ack
                    await emitNextOp(); // flush finish summarizing
                    await emitNextOp(summaryConfig.maxOps + 1);
                    assert.strictEqual(runCount, 2);
                    deferGenerateSummary.resolve();
                });
            });

            describe("Summary Start", () => {
                it("Should summarize immediately if summary ack is missing at startup", async () => {
                    assert.strictEqual(runCount, 0);
                    // Simulate as summary op was in opstream.
                    const summaryTimestamp = Date.now();
                    emitBroadcast(summaryTimestamp);

                    let startStatus: "starting" | "started" | "failed" = "starting";
                    startRunningSummarizer().then(() => startStatus = "started", () => startStatus = "failed");
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
                    assert.strictEqual(runCount, 1, "Should run summarizer once");
                    assert(mockLogger.matchEvents([
                        { eventName: "Running:GenerateSummary", summaryGenTag: runCount },
                        { eventName: "Running:SummaryOp", summaryGenTag: runCount },
                    ]), "unexpected log sequence 2");

                    assert(!mockLogger.matchEvents([
                        { eventName: "Running:Summarize_end" },
                    ]), "No ack expected yet");

                    // Now emit ack
                    await emitAck();
                    assert(mockLogger.matchEvents([
                        { eventName: "Running:Summarize_end", summaryGenTag: runCount, reason: "maxOps" },
                    ]), "unexpected log sequence 3");
                });
            });
        });
    });
});
