/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
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
import { MockLogger } from "@fluidframework/test-runtime-utils";
import { RunningSummarizer } from "../summarizer";
import { SummaryCollection } from "../summaryCollection";

describe("Runtime", () => {
    describe("Container Runtime", () => {
        describe("RunningSummarizer", () => {
            describe("Summary Schedule", () => {
                let runCount: number;
                let clock: sinon.SinonFakeTimers;
                let mockLogger: MockLogger;
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

                async function emitNextOp(increment: number = 1) {
                    lastRefSeq += increment;
                    const op: Partial<ISequencedDocumentMessage> = {
                        sequenceNumber: lastRefSeq,
                        timestamp: Date.now(),
                    };
                    summarizer.handleOp(undefined, op as ISequencedDocumentMessage);
                    await flushPromises();
                }

                function emitBroadcast() {
                    // eslint-disable-next-line @typescript-eslint/consistent-type-assertions
                    summaryCollection.handleOp({
                        type: MessageType.Summarize,
                        clientId: summarizerClientId,
                        referenceSequenceNumber: lastRefSeq,
                        clientSequenceNumber: --lastClientSeq,
                        sequenceNumber: --lastSummarySeq,
                        contents: {
                            handle: "test-broadcast-handle",
                        },
                    } as ISequencedDocumentMessage);
                }

                async function emitAck(type: MessageType = MessageType.SummaryAck) {
                    const summaryProposal: ISummaryProposal = {
                        summarySequenceNumber: lastSummarySeq,
                    };
                    const contents: ISummaryAck = {
                        handle: "test-ack-handle",
                        summaryProposal,
                    };
                    // eslint-disable-next-line @typescript-eslint/consistent-type-assertions
                    summaryCollection.handleOp({ contents, type } as ISequencedDocumentMessage);

                    await flushPromises(); // let summarize run
                }

                async function tickAndFlushPromises(ms: number) {
                    clock.tick(ms);
                    await flushPromises();
                }

                before(() => {
                    clock = sinon.useFakeTimers();
                });

                beforeEach(async () => {
                    shouldDeferGenerateSummary = false;
                    clock.reset();
                    runCount = 0;
                    lastRefSeq = 0;
                    mockLogger = new MockLogger();
                    summaryCollection = new SummaryCollection(0, mockLogger);
                    summarizer = await RunningSummarizer.start(
                        summarizerClientId,
                        onBehalfOfClientId,
                        mockLogger,
                        summaryCollection.createWatcher(summarizerClientId),
                        summaryConfig,
                        { generateSummary: async () => {
                            runCount++;

                            // immediate broadcast
                            emitBroadcast();

                            if (shouldDeferGenerateSummary) {
                                deferGenerateSummary = new Deferred<void>();
                                await deferGenerateSummary.promise;
                            }
                            return {
                                referenceSequenceNumber: lastRefSeq,
                                submitted: true,
                                summaryStats: {
                                    treeNodeCount: 0,
                                    blobNodeCount: 0,
                                    handleNodeCount: 0,
                                    totalBlobSize: 0,
                                },
                                handle: "test-handle",
                                clientSequenceNumber: lastClientSeq,
                            };
                        } },
                        0,
                        { refSequenceNumber: 0, summaryTime: Date.now() },
                        false,
                        () => { },
                    );
                });

                after(() => {
                    clock.restore();
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
                        { eventName: "Running:GenerateSummary_start", summaryGenTag: runCount },
                        { eventName: "Running:GenerateSummary_end", summaryGenTag: runCount },
                        { eventName: "Running:SummaryOp", summaryGenTag: runCount },
                    ]), "unexpected log sequence");

                    // should not run, because our summary hasnt been acked/nacked yet
                    await emitNextOp(summaryConfig.maxOps + 1);
                    assert.strictEqual(runCount, 1);

                    // should run, because another op has come in, and our summary has been acked
                    await emitAck();
                    assert.strictEqual(runCount, 2);
                    assert(mockLogger.matchEvents([
                        { eventName: "Running:SummaryAck", summaryGenTag: (runCount - 1) }, // ack for previous run
                        { eventName: "Running:GenerateSummary_start", summaryGenTag: runCount },
                        { eventName: "Running:GenerateSummary_end", summaryGenTag: runCount },
                        { eventName: "Running:SummaryOp", summaryGenTag: runCount },
                    ]), "unexpected log sequence");

                    await emitNextOp();
                    assert.strictEqual(runCount, 2);
                    assert(!mockLogger.matchEvents([
                        { eventName: "Running:SummaryAck" },
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
        });
    });
});
