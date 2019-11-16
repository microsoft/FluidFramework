/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import {
    IDeltaManager,
    IDeltaQueue,
    IDocumentStorageService,
    ITelemetryLogger } from "@microsoft/fluid-container-definitions";
import {
    IDocumentMessage,
    ISequencedDocumentMessage,
    ISummaryConfiguration,
    ISummaryProposal,
    MessageType,
} from "@microsoft/fluid-protocol-definitions";
import { Deferred } from "@microsoft/fluid-server-services-client";
import * as assert from "assert";
import { EventEmitter } from "events";
import * as sinon from "sinon";
import { ContainerRuntime } from "../containerRuntime";
import { Summarizer } from "../summarizer";

describe("Runtime", () => {
    describe("Container Runtime", () => {
        describe("Summarizer", () => {
            describe("Summary Schedule", () => {
                let runCount: number;
                let clock: sinon.SinonFakeTimers;
                let emitter: EventEmitter;
                let summarizer: Summarizer;
                const summarizerClientId = "test";
                let lastSeq = 0;
                const batchEndEvent = "batchEnd";
                const generateSummaryEvent = "generateSummary";
                const summaryOpEvent = "op";
                const summaryConfig: ISummaryConfiguration = {
                    idleTime: 5000, // 5 sec (idle)
                    maxTime: 5000 * 12, // 1 min (active)
                    maxOps: 1000, // 1k ops (active)
                    maxAckWaitTime: 600000, // 10 min
                };
                const testSummaryOpSeqNum = -13;
                let refreshBaseSummaryDeferred: Deferred<void>;
                let shouldDeferGenerateSummary: boolean = false;
                let deferGenerateSummary: Deferred<void>;

                before(() => {
                    clock = sinon.useFakeTimers();
                });

                beforeEach(() => {
                    shouldDeferGenerateSummary = false;
                    clock.reset();
                    runCount = 0;
                    lastSeq = 0;
                    refreshBaseSummaryDeferred = new Deferred();
                    emitter = new EventEmitter();
                    summarizer = new Summarizer(
                        "",
                        {
                            on: (event, listener) => emitter.on(event, listener),
                            off: (event, listener) => emitter.removeListener(event, listener),
                            connected: true,
                            summarizerClientId,
                            deltaManager: {
                                initialSequenceNumber: 0,
                                inbound: emitter as IDeltaQueue<ISequencedDocumentMessage>,
                            } as IDeltaManager<ISequencedDocumentMessage, IDocumentMessage>,
                            logger: {
                                send: (event) => {},
                                sendTelemetryEvent: (event) => {},
                            } as ITelemetryLogger,
                            storage: {
                                getSnapshotTree: () => Promise.resolve({}),
                                getVersions: (versionId, count) => Promise.resolve([{}]),
                            } as IDocumentStorageService,
                        } as ContainerRuntime,
                        () => summaryConfig,
                        async () => {
                            emitter.emit(generateSummaryEvent);
                            if (shouldDeferGenerateSummary) {
                                deferGenerateSummary = new Deferred<void>();
                                await deferGenerateSummary.promise;
                            }
                            return {
                                sequenceNumber: lastSeq,
                                submitted: true,
                                treeNodeCount: 0,
                                blobNodeCount: 0,
                                handleNodeCount: 0,
                                totalBlobSize: 0,
                            };
                        },
                        () => { refreshBaseSummaryDeferred.resolve(); },
                    );

                    summarizer.run(summarizerClientId).catch((reason) => assert.fail(JSON.stringify(reason)));
                    listenWithBroadcast();
                });

                after(() => {
                    clock.restore();
                });

                function generateNextOp(increment: number = 1): Partial<ISequencedDocumentMessage> {
                    lastSeq += increment;
                    return {
                        sequenceNumber: lastSeq,
                    };
                }

                async function emitNextOp(increment: number = 1) {
                    emitter.emit(batchEndEvent, undefined, generateNextOp(increment));
                    await Promise.resolve();
                }

                function listenWithBroadcast(action?: () => void) {
                    emitter.on(generateSummaryEvent, () => {
                        if (action) {
                            action();
                        }
                        runCount++;
                        emitBroadcast();
                    });
                }

                function emitBroadcast() {
                    emitter.emit(summaryOpEvent, {
                        type: MessageType.Summarize,
                        referenceSequenceNumber: lastSeq,
                        sequenceNumber: testSummaryOpSeqNum,
                    });
                }

                async function emitAck(type: MessageType = MessageType.SummaryAck) {
                    const summaryProposal: ISummaryProposal = {
                        summarySequenceNumber: testSummaryOpSeqNum,
                    };
                    emitter.emit(summaryOpEvent, { contents: { summaryProposal }, type });

                    // wait for refresh base summary to complete
                    await refreshBaseSummaryDeferred.promise;
                    refreshBaseSummaryDeferred = new Deferred();
                }

                it("Should summarize after configured number of ops when not pending", async () => {
                    await emitNextOp();

                    // too early, should not run yet
                    await emitNextOp(summaryConfig.maxOps - 1);
                    assert.strictEqual(runCount, 0);

                    // now should run
                    await emitNextOp(1);
                    assert.strictEqual(runCount, 1);

                    // should not run, because our summary hasnt been acked/nacked yet
                    await emitNextOp(summaryConfig.maxOps + 1);
                    assert.strictEqual(runCount, 1);

                    // should run, because another op has come in, and our summary has been acked
                    await emitAck();
                    await emitNextOp();
                    assert.strictEqual(runCount, 2);
                });

                it("Should summarize after configured idle time when not pending", async () => {
                    await emitNextOp();

                    // too early, should not run yet
                    clock.tick(summaryConfig.idleTime - 1);
                    await Promise.resolve();
                    assert.strictEqual(runCount, 0);

                    // now should run
                    clock.tick(1);
                    await Promise.resolve();
                    assert.strictEqual(runCount, 1);

                    // should not run, because our summary hasnt been acked/nacked yet
                    await emitNextOp();
                    clock.tick(summaryConfig.idleTime);
                    await Promise.resolve();
                    assert.strictEqual(runCount, 1);

                    // should run, because another op has come in, and our summary has been acked
                    await emitAck();
                    await emitNextOp();
                    clock.tick(summaryConfig.idleTime);
                    assert.strictEqual(runCount, 2);
                });

                it("Should summarize after configured active time when not pending", async () => {
                    const idlesPerActive = Math.floor((summaryConfig.maxTime + 1) / (summaryConfig.idleTime - 1));
                    const remainingTime = (summaryConfig.maxTime + 1) % (summaryConfig.idleTime - 1);
                    await emitNextOp();

                    // too early should not run yet
                    for (let i = 0; i < idlesPerActive; i++) {
                        // prevent idle from triggering with periodic ops
                        clock.tick(summaryConfig.idleTime - 1);
                        await emitNextOp();
                    }
                    clock.tick(remainingTime - 1);
                    await emitNextOp();
                    assert.strictEqual(runCount, 0);

                    // now should run
                    clock.tick(1);
                    await emitNextOp();
                    assert.strictEqual(runCount, 1);

                    // should not run because our summary hasnt been acked/nacked yet
                    for (let i = 0; i < idlesPerActive; i++) {
                        // prevent idle from triggering with periodic ops
                        clock.tick(summaryConfig.idleTime - 1);
                        await emitNextOp();
                    }
                    clock.tick(remainingTime);
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
                    clock.tick(summaryConfig.maxAckWaitTime - 1);
                    await emitNextOp(summaryConfig.maxOps + 1);
                    assert.strictEqual(runCount, 1);

                    // should run because pending timeout
                    clock.tick(1);
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
                    clock.tick(summaryConfig.maxAckWaitTime);

                    // subsequent summary should not cancel pending!
                    await emitNextOp(summaryConfig.maxOps + 1);
                    assert.strictEqual(runCount, 2);
                    await emitNextOp(); // fine
                    clock.tick(1); // next op will exceed maxAckWaitTime from first summary
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
