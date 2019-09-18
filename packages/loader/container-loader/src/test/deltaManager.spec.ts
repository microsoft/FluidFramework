/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { MockDocumentDeltaConnection, MockDocumentService } from "@microsoft/fluid-test-loader-utils";
import { IProcessMessageResult, ITelemetryLogger } from "@prague/container-definitions";
import { IDocumentMessage, MessageType } from "@prague/protocol-definitions";
import { DebugLogger } from "@prague/utils";
import * as assert from "assert";
import { EventEmitter } from "events";
import { SinonFakeTimers, useFakeTimers } from "sinon";
import { DeltaManager } from "../deltaManager";

describe("Loader", () => {
    describe("Container Loader", () => {
        describe("Delta Manager", () => {
            let clock: SinonFakeTimers;
            let deltaManager: DeltaManager;
            let logger: ITelemetryLogger;
            let deltaConnection: MockDocumentDeltaConnection;
            let emitter: EventEmitter;
            let seq: number;
            let intendedResult: IProcessMessageResult;
            const docId = "docId";
            const submitEvent = "test-submit";

            async function startDeltaManager(readonly: boolean = false) {
                await deltaManager.connect("test");
                await deltaManager.inbound.resume();
                await deltaManager.outbound.resume();
                await deltaManager.inboundSignal.resume();
                if (!readonly) {
                    deltaManager.disableReadonlyMode();
                }
            }

            function emitSequentialOp(type: MessageType = MessageType.Operation) {
                deltaConnection.emitOp(docId, [{
                    minimumSequenceNumber: 0,
                    sequenceNumber: seq++,
                    type,
                }]);
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
                const service = new MockDocumentService(
                    undefined,
                    () => deltaConnection,
                );

                deltaManager = new DeltaManager(
                    service,
                    null,
                    logger,
                    false,
                );
                deltaManager.attachOpHandler(0, 0, {
                    process(message, callback) {
                        callback(intendedResult);
                    },
                    processSignal() {},
                }, true);
            });

            afterEach(() => {
                clock.reset();
            });

            after(() => {
                clock.restore();
            });

            describe("Update Minimum Sequence Number", () => {
                const expectedTimeout = 100;

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

                    emitSequentialOp();
                    clock.tick(expectedTimeout - 1);
                    assert.strictEqual(runCount, 0);

                    clock.tick(1);
                    assert.strictEqual(runCount, 1);
                });

                it("Should not update early with successive ops", async () => {
                    const numberOfInterrupts = 10;
                    let runCount = 0;

                    await startDeltaManager();
                    emitter.on(submitEvent, (messages: IDocumentMessage[]) => {
                        assertOneValidNoOp(messages);
                        runCount++;
                    });

                    // initial op
                    emitSequentialOp();

                    for (let i = 0; i < numberOfInterrupts; i++) {
                        clock.tick(expectedTimeout - 1);
                        emitSequentialOp();
                        clock.tick(1); // trigger canceled timeout, start new timeout
                    }
                    clock.tick(expectedTimeout - 1);
                    assert.strictEqual(runCount, 0);

                    clock.tick(1);
                    assert.strictEqual(runCount, 1);
                });

                it("Should not update when receiving no-ops", async () => {
                    await startDeltaManager();
                    emitter.on(submitEvent, (messages: IDocumentMessage[]) => {
                        assertOneValidNoOp(messages);
                        assert.fail("Should not send no-op.");
                    });

                    emitSequentialOp(MessageType.NoOp);
                    clock.tick(expectedTimeout);
                });

                it("Should immediately update with immediate content", async () => {
                    intendedResult = { immediateNoOp: true };
                    let runCount = 0;
                    await startDeltaManager();

                    emitter.on(submitEvent, (messages: IDocumentMessage[]) => {
                        assertOneValidNoOp(messages, true);
                        runCount++;
                    });

                    emitSequentialOp(MessageType.NoOp);
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

                    emitSequentialOp();
                    clock.tick(expectedTimeout - 1);
                    deltaManager.submit(MessageType.Operation, ignoreContent);
                    clock.tick(1);

                    // make extra sure
                    clock.tick(expectedTimeout);
                });
            });
        });
    });
});
