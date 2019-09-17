/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { IDeltaManager, IDeltaQueue } from "@prague/container-definitions";
import { IDocumentMessage, ISequencedDocumentMessage, ISummaryConfiguration, MessageType } from "@prague/protocol-definitions";
import * as assert from "assert";
import { EventEmitter } from "events";
import * as sinon from "sinon";
import { ContainerRuntime } from "../containerRuntime";
import { Summarizer } from "../summarizer";

describe("Runtime", () => {
    describe("Container Runtime", () => {
        describe("Summarizer", () => {
            describe("Summary Schedule", () => {
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

                before(() => {
                    clock = sinon.useFakeTimers();
                });

                beforeEach(() => {
                    clock.reset();
                    lastSeq = 0;
                    emitter = new EventEmitter();
                    summarizer = new Summarizer(
                        "",
                        {
                            on: (event, listener) => emitter.on(event, listener),
                            off: (event, listener) => emitter.off(event, listener),
                            connected: true,
                            summarizerClientId,
                            deltaManager: {
                                inbound: emitter as IDeltaQueue<ISequencedDocumentMessage>,
                            } as IDeltaManager<ISequencedDocumentMessage, IDocumentMessage>,
                        } as ContainerRuntime,
                        summaryConfig,
                        async () => { emitter.emit(generateSummaryEvent); },
                    );
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

                it("Should summarize after configured number of ops when not pending", async () => {
                    let runCount = 0;
                    summarizer.run(summarizerClientId).catch((reason) => assert.fail(JSON.stringify(reason)));
                    emitter.on(generateSummaryEvent, () => runCount++);
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
                    emitter.emit(summaryOpEvent, { type: MessageType.SummaryAck });
                    await emitNextOp();
                    assert.strictEqual(runCount, 2);
                });

                it("Should summarize after configured idle time when not pending", async () => {
                    let runCount = 0;
                    summarizer.run(summarizerClientId).catch((reason) => assert.fail(JSON.stringify(reason)));
                    emitter.on(generateSummaryEvent, () => runCount++);
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
                    emitter.emit(summaryOpEvent, { type: MessageType.SummaryAck });
                    await emitNextOp();
                    clock.tick(summaryConfig.idleTime + 1);
                    await Promise.resolve();
                    assert.strictEqual(runCount, 2);
                });

                it("Should summarize after configured active time when not pending", async () => {
                    let runCount = 0;
                    const idlesPerActive = Math.floor((summaryConfig.maxTime + 1) / (summaryConfig.idleTime - 1));
                    const remainingTime = (summaryConfig.maxTime + 1) % (summaryConfig.idleTime - 1);
                    summarizer.run(summarizerClientId).catch((reason) => assert.fail(JSON.stringify(reason)));
                    emitter.on(generateSummaryEvent, () => runCount++);
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
                    emitter.emit(summaryOpEvent, { type: MessageType.SummaryAck });
                    await emitNextOp();
                    assert.strictEqual(runCount, 2);
                });

                it("Should summarize after pending timeout", async () => {
                    let runCount = 0;
                    summarizer.run(summarizerClientId).catch((reason) => assert.fail(JSON.stringify(reason)));
                    emitter.on(generateSummaryEvent, () => runCount++);

                    // first run to start pending
                    await emitNextOp(summaryConfig.maxOps + 1);
                    assert.strictEqual(runCount, 1);

                    // should not run because still pending
                    clock.tick(summaryConfig.maxAckWaitTime);
                    await emitNextOp(summaryConfig.maxOps + 1);
                    assert.strictEqual(runCount, 1);

                    // should run because pending timeout
                    clock.tick(1);
                    await emitNextOp();
                    assert.strictEqual(runCount, 2);
                });
            });
        });
    });
});
