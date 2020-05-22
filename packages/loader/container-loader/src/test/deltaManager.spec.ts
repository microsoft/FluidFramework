/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import assert from "assert";
import { EventEmitter } from "events";
import { ITelemetryLogger } from "@fluidframework/common-definitions";
import { DebugLogger } from "@fluidframework/common-utils";
import { IClient, IDocumentMessage, IProcessMessageResult, MessageType } from "@fluidframework/protocol-definitions";
import { MockDocumentDeltaConnection, MockDocumentService } from "@fluidframework/test-loader-utils";
import { SinonFakeTimers, useFakeTimers } from "sinon";
import { DeltaManager } from "../deltaManager";

describe("Loader", () => {
    describe("Container Loader", () => {
        describe("Delta Manager", () => {
            let clock: SinonFakeTimers;
            let deltaManager: DeltaManager;
            let logger: ITelemetryLogger;
            let deltaConnection: MockDocumentDeltaConnection;
            let clientSeqNumber = 0;
            let emitter: EventEmitter;
            let seq: number;
            let intendedResult: IProcessMessageResult;
            const docId = "docId";
            const submitEvent = "test-submit";
            // Stash the real setTimeout because sinon fake timers will hijack it.
            const realSetTimeout = setTimeout;

            async function startDeltaManager() {
                await deltaManager.connect();
                deltaManager.inbound.resume();
                deltaManager.outbound.resume();
                deltaManager.inboundSignal.resume();
                deltaManager.updateQuorumJoin();
            }

            // function to yield control in the Javascript event loop.
            async function yieldEventLoop(): Promise<void> {
                await new Promise<void>((resolve) => {
                    realSetTimeout(resolve, 0);
                });
            }

            async function emitSequentialOp(type: MessageType = MessageType.Operation) {
                deltaConnection.emitOp(docId, [{
                    clientId: "Some client ID",
                    clientSequenceNumber: ++clientSeqNumber,
                    minimumSequenceNumber: 0,
                    sequenceNumber: seq++,
                    type,
                }]);

                // Yield the event loop because the inbound op will be processed asynchronously.
                await yieldEventLoop();
            }

            async function tickClock(tickValue: number) {
                clock.tick(tickValue);

                // Yield the event loop because the outbound op will be processed asynchronously.
                await yieldEventLoop();
            }

            before(() => {
                clock = useFakeTimers();
            });

            beforeEach(() => {
                seq = 1;
                logger = DebugLogger.create("fluid:testDeltaManager");
                emitter = new EventEmitter();
                intendedResult = {};

                deltaConnection = new MockDocumentDeltaConnection(
                    "test",
                    (messages) => emitter.emit(submitEvent, messages),
                );
                clientSeqNumber = 0;
                const service = new MockDocumentService(
                    undefined,
                    () => deltaConnection,
                );
                const client: Partial<IClient> = { mode: "write", details: { capabilities: { interactive: true } } };

                deltaManager = new DeltaManager(
                    () => service,
                    client as IClient,
                    logger,
                    false,
                );
                deltaManager.attachOpHandler(0, 0, 1, {
                    process: (message) => intendedResult,
                    processSignal() {},
                });
            });

            afterEach(() => {
                clock.reset();
            });

            after(() => {
                clock.restore();
            });

            describe("Update Minimum Sequence Number", () => {
                const expectedTimeout = 2000;

                // helper function asserting that there is exactly one well-formed no-op
                function assertOneValidNoOp(messages: IDocumentMessage[], immediate: boolean = false) {
                    assert.strictEqual(1, messages.length);
                    assert.strictEqual(MessageType.NoOp, messages[0].type);
                    assert.strictEqual(immediate ? "" : null, JSON.parse(messages[0].contents as string));
                }

                it("Should update after timeout with single op", async () => {
                    let runCount = 0;
                    await startDeltaManager();
                    emitter.on(submitEvent, (messages: IDocumentMessage[]) => {
                        assertOneValidNoOp(messages);
                        runCount++;
                    });

                    await emitSequentialOp();

                    await tickClock(expectedTimeout - 1);
                    assert.strictEqual(runCount, 0);

                    await tickClock(1);
                    assert.strictEqual(runCount, 1);
                });

                it("Should update after first timeout with successive ops", async () => {
                    const numberOfSuccessiveOps = 10;
                    assert(expectedTimeout > numberOfSuccessiveOps + 1);
                    let runCount = 0;

                    await startDeltaManager();
                    emitter.on(submitEvent, (messages: IDocumentMessage[]) => {
                        assertOneValidNoOp(messages);
                        runCount++;
                    });

                    // initial op
                    await emitSequentialOp();

                    for (let i = 0; i < numberOfSuccessiveOps; i++) {
                        await tickClock(1);
                        await emitSequentialOp();
                    }
                    // should not run until timeout
                    await tickClock(expectedTimeout - numberOfSuccessiveOps - 1);
                    assert.strictEqual(runCount, 0);

                    // should run after timeout
                    await tickClock(1);
                    assert.strictEqual(runCount, 1);

                    // should not run again (make sure no additional timeouts created)
                    await tickClock(expectedTimeout);
                    assert.strictEqual(runCount, 1);
                });

                it("Should not update when receiving no-ops", async () => {
                    await startDeltaManager();
                    emitter.on(submitEvent, (messages: IDocumentMessage[]) => {
                        assertOneValidNoOp(messages);
                        assert.fail("Should not send no-op.");
                    });

                    await emitSequentialOp(MessageType.NoOp);
                    await tickClock(expectedTimeout);
                });

                it("Should immediately update with immediate content", async () => {
                    intendedResult = { immediateNoOp: true };
                    let runCount = 0;
                    await startDeltaManager();

                    emitter.on(submitEvent, (messages: IDocumentMessage[]) => {
                        assertOneValidNoOp(messages, true);
                        runCount++;
                    });

                    await emitSequentialOp(MessageType.NoOp);
                    assert.strictEqual(runCount, 1);
                });

                it("Should not update if op submitted during timeout", async () => {
                    const ignoreContent = "ignoreThisMessage";
                    let canIgnore = true;
                    await startDeltaManager();

                    emitter.on(submitEvent, (messages: IDocumentMessage[]) => {
                        // we can ignore our own op
                        if (
                            messages
                            && messages.length === 1
                            && messages[0].type === MessageType.Operation
                            && messages[0].contents
                            && JSON.parse(messages[0].contents as string) === ignoreContent
                            && canIgnore
                        ) {
                            canIgnore = false;
                            return;
                        }
                        assert.fail("Should not send no-op.");
                    });

                    await emitSequentialOp();
                    await tickClock(expectedTimeout - 1);
                    deltaManager.submit(MessageType.Operation, ignoreContent);
                    await tickClock(1);

                    // make extra sure
                    await tickClock(expectedTimeout);
                });
            });
        });
    });
});
