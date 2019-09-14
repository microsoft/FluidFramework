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
import { DeltaManager } from "../deltaManager";

describe("Loader", () => {
    describe("Container Loader", () => {
        describe("Delta Manager", () => {
            let deltaManager: DeltaManager;
            let logger: ITelemetryLogger;
            let deltaConnection: MockDocumentDeltaConnection;
            let emitter: EventEmitter;
            let seq: number;
            let intendedResult: IProcessMessageResult;
            const docId = "docId";
            const submitEvent = "test-submit";
            const enum WaitResult {
                before = 0,
                during = 1,
                after = 2,
            }

            // helper function that resolves with different wait results depending on when the action resolves
            // resolves with before if the action resolves before the until time
            // resolves with after otherwise
            function waitUntil(until: number, action: () => Promise<void>): Promise<WaitResult> {
                return new Promise((resolve, reject) => {
                    action().then(() => resolve(WaitResult.before));
                    setTimeout(() => resolve(WaitResult.after), until);
                });
            }

            // helper function that resolves with different wait results depending on when the action resolves
            // resolves with before if the action resolves before the from time
            // resolves with during if the action resolves between the from to the until time
            // resolves with after if the action does not resolve before the until time
            function waitFromUntil(from: number, until: number, action: () => Promise<void>): Promise<WaitResult> {
                return new Promise((resolve, reject) => {
                    let during = false;
                    action().then(() => {
                        resolve(during ? WaitResult.during : WaitResult.before);
                    });
                    setTimeout(() => {
                        during = true;
                    }, from);
                    setTimeout(() => {
                        resolve(WaitResult.after);
                    }, until);
                });
            }

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

            describe("Update Minimum Sequence Number", () => {
                const expectedTimeout = 100;

                // helper function asserting that there is exactly one well-formed no-op
                function assertOneValidNoOp(messages: IDocumentMessage[], immediate: boolean = false) {
                    assert.strictEqual(1, messages.length);
                    assert.strictEqual(MessageType.NoOp, messages[0].type);
                    assert.strictEqual(immediate ? "" : null, JSON.parse(messages[0].contents as string));
                }

                it("Should update after timeout with single op", async () => {
                    await startDeltaManager();
                    const result = await waitFromUntil(expectedTimeout / 2, expectedTimeout * 2, () => {
                        return new Promise((resolve, reject) => {
                            emitter.on(submitEvent, (messages: IDocumentMessage[]) => {
                                assertOneValidNoOp(messages);
                                resolve();
                            });

                            emitSequentialOp();
                        });
                    });
                    assert.strictEqual(WaitResult.during, result);
                });

                it("Should not update early with successive ops", async () => {
                    const numberOfInterrupts = 10;
                    const halfTimeout = expectedTimeout / 2;
                    const expectedFromTime = expectedTimeout * numberOfInterrupts + halfTimeout;
                    const expectedUntilTime = expectedFromTime + expectedTimeout;

                    await startDeltaManager();
                    const resultP = waitFromUntil(expectedFromTime, expectedUntilTime, () => {
                        return new Promise((resolve, reject) => {
                            emitter.on(submitEvent, (messages: IDocumentMessage[]) => {
                                assertOneValidNoOp(messages);
                                resolve();
                            });
                        });
                    });

                    // initial op
                    emitSequentialOp();
                    for (let i = 0; i < numberOfInterrupts; i++) {
                        // emit every expectedTimeout, but offset by half to ensure they interrupt
                        setTimeout(() => { emitSequentialOp(); }, expectedTimeout * i + halfTimeout);
                    }

                    assert.strictEqual(WaitResult.during, await resultP);
                });

                it("Should not update when receiving no-ops", async () => {
                    await startDeltaManager();
                    const result = await waitFromUntil(0, expectedTimeout * 2, () => {
                        return new Promise((resolve, reject) => {
                            emitter.on(submitEvent, (messages: IDocumentMessage[]) => {
                                assertOneValidNoOp(messages);
                                assert(false);
                                resolve();
                            });

                            emitSequentialOp(MessageType.NoOp);
                        });
                    });

                    assert.strictEqual(WaitResult.after, result);
                });

                it("Should immediately update with immediate content", async () => {
                    intendedResult = { immediateNoOp: true };
                    await startDeltaManager();
                    const result = await waitUntil(expectedTimeout / 2, () => {
                        return new Promise((resolve, reject) =>  {
                            emitter.on(submitEvent, (messages: IDocumentMessage[]) => {
                                assertOneValidNoOp(messages, true);
                                resolve();
                            });

                            emitSequentialOp();
                        });
                    });

                    assert.strictEqual(WaitResult.before, result);
                });

                it("Should not update if op submitted during timeout", async () => {
                    const ignoreContent = "ignoreThisMessage";
                    let canIgnore = true;
                    await startDeltaManager();
                    const result = await waitUntil(expectedTimeout * 2, () => {
                        return new Promise((resolve, reject) =>  {
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
                                assertOneValidNoOp(messages);
                                resolve();
                            });

                            setTimeout(
                                () => deltaManager.submit(MessageType.Operation, ignoreContent),
                                expectedTimeout / 2,
                            );

                            emitSequentialOp();
                        });
                    });

                    assert.strictEqual(WaitResult.after, result);
                });
            });
        });
    });
});
