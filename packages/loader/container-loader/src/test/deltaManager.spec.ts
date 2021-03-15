/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "assert";
import { EventEmitter } from "events";
import { ITelemetryLogger } from "@fluidframework/common-definitions";
import { DebugLogger } from "@fluidframework/telemetry-utils";
import { IClient, IDocumentMessage, MessageType } from "@fluidframework/protocol-definitions";
import { MockDocumentDeltaConnection, MockDocumentService } from "@fluidframework/test-loader-utils";
import { SinonFakeTimers, useFakeTimers } from "sinon";
import { DeltaManager } from "../deltaManager";
import { CollabWindowTracker } from "../container";

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
            let immediateNoOp: boolean;
            const docId = "docId";
            const submitEvent = "test-submit";
            const expectedTimeout = 2000;
            const noopCountFrequency = 300;
            // Stash the real setTimeout because sinon fake timers will hijack it.
            const realSetTimeout = setTimeout;

            async function startDeltaManager() {
                await deltaManager.connect({ reason: "test" });
                deltaManager.inbound.resume();
                deltaManager.outbound.resume();
                deltaManager.inboundSignal.resume();
            }

            // function to yield control in the Javascript event loop.
            async function yieldEventLoop(): Promise<void> {
                await new Promise<void>((resolve) => {
                    realSetTimeout(resolve, 0);
                });
            }

            async function emitSequentialOps(type: MessageType = MessageType.Operation, count = 1) {
                for (let num = 0; num < count; ++num) {
                    deltaConnection.emitOp(docId, [{
                        clientId: "Some client ID",
                        clientSequenceNumber: ++clientSeqNumber,
                        minimumSequenceNumber: 0,
                        sequenceNumber: seq++,
                        type,
                    }]);
                }

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
                immediateNoOp = false;

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
                    () => false,
                );

                const tracker = new CollabWindowTracker(
                    (type: MessageType, contents: any) => deltaManager.submit(type, contents),
                    () => true,
                    expectedTimeout,
                    noopCountFrequency,
                );

                deltaManager.attachOpHandler(0, 0, 1, {
                    process: (message) => tracker.scheduleSequenceNumberUpdate(message, immediateNoOp),
                    processSignal() { },
                });
            });

            afterEach(() => {
                clock.reset();
            });

            after(() => {
                clock.restore();
            });

            describe("Update Minimum Sequence Number", () => {
                // helper function asserting that there is exactly one well-formed no-op
                function assertOneValidNoOp(messages: IDocumentMessage[], immediate: boolean = false) {
                    assert.strictEqual(1, messages.length);
                    assert.strictEqual(MessageType.NoOp, messages[0].type);
                    assert.strictEqual(immediate ? "" : null, JSON.parse(messages[0].contents as string));
                }

                it("Should not update after timeout with op lesser the threshold", async () => {
                    let runCount = 0;
                    await startDeltaManager();
                    emitter.on(submitEvent, (messages: IDocumentMessage[]) => {
                        assertOneValidNoOp(messages);
                        runCount++;
                        assert.fail("Should not fire noop");
                    });

                    await emitSequentialOps(MessageType.Operation, noopCountFrequency - 1);

                    await tickClock(expectedTimeout - 1);
                    assert.strictEqual(runCount, 0);

                    await tickClock(1);
                    assert.strictEqual(runCount, 0);
                });

                it("Should not update after op count threshold but time lesser than timeout", async () => {
                    let runCount = 0;
                    await startDeltaManager();
                    emitter.on(submitEvent, (messages: IDocumentMessage[]) => {
                        assertOneValidNoOp(messages);
                        runCount++;
                        assert.fail("Should not fire noop");
                    });

                    await emitSequentialOps(MessageType.Operation, noopCountFrequency);
                    assert.strictEqual(runCount, 0);

                    await tickClock(expectedTimeout - 1);
                    assert.strictEqual(runCount, 0);
                });

                it("Should not update after ops freq until time threshold reached", async () => {
                    let runCount = 0;

                    await startDeltaManager();
                    emitter.on(submitEvent, (messages: IDocumentMessage[]) => {
                        assertOneValidNoOp(messages);
                        runCount++;
                    });

                    await emitSequentialOps(MessageType.Operation, noopCountFrequency);
                    // should not run until timeout
                    await tickClock(expectedTimeout - 1);
                    assert.strictEqual(runCount, 0);

                    // should run after timeout
                    await tickClock(1);
                    await emitSequentialOps();
                    assert.strictEqual(runCount, 1);

                    // Now timeout again should not cause noop
                    await tickClock(expectedTimeout);
                    assert.strictEqual(runCount, 1);
                });

                it("Should update after timeout until ops threshold reached", async () => {
                    let runCount = 0;

                    await startDeltaManager();
                    emitter.on(submitEvent, (messages: IDocumentMessage[]) => {
                        assertOneValidNoOp(messages);
                        runCount++;
                    });

                    await emitSequentialOps(MessageType.Operation, noopCountFrequency - 1);
                    // should not run until ops count
                    await tickClock(expectedTimeout);
                    assert.strictEqual(runCount, 0);

                    // should run after ops count
                    await emitSequentialOps();
                    assert.strictEqual(runCount, 1);
                });

                it("Should not update when receiving just no-ops even after timeout", async () => {
                    await startDeltaManager();
                    emitter.on(submitEvent, (messages: IDocumentMessage[]) => {
                        assertOneValidNoOp(messages);
                        assert.fail("Should not send no-op.");
                    });

                    await emitSequentialOps(MessageType.NoOp, noopCountFrequency + 1);
                    await tickClock(expectedTimeout);
                });

                it("Should immediately update with immediate content", async () => {
                    immediateNoOp = true;
                    let runCount = 0;
                    await startDeltaManager();

                    emitter.on(submitEvent, (messages: IDocumentMessage[]) => {
                        assertOneValidNoOp(messages, true);
                        runCount++;
                    });

                    await emitSequentialOps(MessageType.NoOp);
                    assert.strictEqual(runCount, 1);
                });

                it("Should not update if op submitted during timeout", async () => {
                    const ignoreContent = "ignoreThisMessage";
                    let canIgnore = true;
                    await startDeltaManager();

                    emitter.on(submitEvent, (messages: IDocumentMessage[]) => {
                        // we can ignore our own op
                        if (
                            messages.length === 1
                            && messages[0].type === MessageType.Operation
                            && messages[0].contents !== undefined
                            && JSON.parse(messages[0].contents as string) === ignoreContent
                            && canIgnore
                        ) {
                            canIgnore = false;
                            return;
                        }
                        assert.fail("Should not send no-op.");
                    });

                    await emitSequentialOps();
                    await tickClock(expectedTimeout - 1);
                    deltaManager.submit(MessageType.Operation, ignoreContent);
                    await tickClock(1);

                    // make extra sure
                    await tickClock(expectedTimeout);
                });
            });

            describe("Readonly API", () => {
                it("Should override readonly", async () => {
                    await startDeltaManager();

                    assert.strictEqual(deltaManager.readonly, false);

                    deltaManager.forceReadonly(true);
                    assert.strictEqual(deltaManager.readonly, true);

                    deltaManager.forceReadonly(false);
                    assert.strictEqual(deltaManager.readonly, false);
                });

                it("Should raise readonly event when container was not readonly", async () => {
                    await startDeltaManager();
                    let runCount = 0;

                    deltaManager.on("readonly", (readonly: boolean) => {
                        assert.strictEqual(readonly, true);
                        runCount++;
                    });

                    deltaManager.forceReadonly(true);
                    assert.strictEqual(runCount, 1);
                });

                it("Shouldn't raise readonly event when container was already readonly", async () => {
                    await startDeltaManager();

                    // Closing underlying connection makes container readonly
                    deltaConnection.close();
                    assert.strictEqual(deltaManager.readonly, true);

                    deltaManager.on("readonly", () => {
                        assert.fail("Shouldn't be called");
                    });

                    deltaManager.forceReadonly(true);
                });
            });
        });
    });
});
