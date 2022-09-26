/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import assert from "assert";
import { ICriticalContainerError } from "@fluidframework/container-definitions";
import { ISequencedDocumentMessage, MessageType } from "@fluidframework/protocol-definitions";
import { DataProcessingError } from "@fluidframework/container-utils";
import { PendingStateManager } from "../pendingStateManager";
import { BatchManager, BatchMessage } from "../batchManager";

describe("Pending State Manager", () => {
    describe("Rollback", () => {
        let rollbackCalled;
        let rollbackContent;
        let rollbackShouldThrow;
        let batchManager: BatchManager;

        function getMessage(payload: string) {
            return { contents: payload } as any as BatchMessage;
        }

        const rollBackCallback = (m: BatchMessage) => {
            rollbackCalled = true;
            rollbackContent.push(m);
            if (rollbackShouldThrow) {
                throw new Error();
            }
        };

        beforeEach(async () => {
            rollbackCalled = false;
            rollbackContent = [];
            rollbackShouldThrow = false;

            batchManager = new BatchManager();
        });

        it("should do nothing when rolling back empty pending stack", () => {
            const checkpoint = batchManager.checkpoint();
            checkpoint.rollback(rollBackCallback);

            assert.strictEqual(rollbackCalled, false);
            assert.strictEqual(batchManager.empty, true);
        });

        it("should do nothing when rolling back nothing", () => {
            batchManager.push(getMessage("1"));
            const checkpoint = batchManager.checkpoint();
            checkpoint.rollback(rollBackCallback);

            assert.strictEqual(rollbackCalled, false);
            assert.strictEqual(batchManager.empty, false);
        });

        it("should succeed when rolling back entire pending stack", () => {
            const checkpoint = batchManager.checkpoint();
            batchManager.push(getMessage("11"));
            batchManager.push(getMessage("22"));
            batchManager.push(getMessage("33"));
            checkpoint.rollback(rollBackCallback);

            assert.strictEqual(rollbackCalled, true);
            assert.strictEqual(rollbackContent.length, 3);
            assert.strictEqual(rollbackContent[0].contents, "33");
            assert.strictEqual(rollbackContent[1].contents, "22");
            assert.strictEqual(rollbackContent[2].contents, "11");
            assert.strictEqual(batchManager.empty, true);
        });

        it("should succeed when rolling back part of pending stack", () => {
            batchManager.push(getMessage("11"));
            const checkpoint = batchManager.checkpoint();
            batchManager.push(getMessage("22"));
            batchManager.push(getMessage("33"));
            checkpoint.rollback(rollBackCallback);

            assert.strictEqual(rollbackCalled, true);
            assert.strictEqual(rollbackContent.length, 2);
            assert.strictEqual(rollbackContent[0].contents, "33");
            assert.strictEqual(rollbackContent[1].contents, "22");
            assert.strictEqual(batchManager.empty, false);
        });

        it("should throw and close when rollback fails", () => {
            rollbackShouldThrow = true;
            const checkpoint = batchManager.checkpoint();
            batchManager.push(getMessage("11"));
            assert.throws(() => { checkpoint.rollback(rollBackCallback); });

            assert.strictEqual(rollbackCalled, true);
        });
    });

    describe("Op processing", () => {
        let pendingStateManager;
        let closeError: ICriticalContainerError | undefined;
        const clientId = "clientId";

        beforeEach(async () => {
            pendingStateManager = new PendingStateManager({
                applyStashedOp: () => { throw new Error(); },
                clientId: () => undefined,
                close: (error?: ICriticalContainerError) => closeError = error,
                connected: () => true,
                flush: () => { },
                reSubmit: () => { },
                rollback: () => { },
                orderSequentially: () => { },
            }, undefined);
        });

        const submitBatch = (messages: Partial<ISequencedDocumentMessage>[]) => {
            messages.forEach((message) => {
                pendingStateManager.onSubmitMessage(
                    message.type,
                    message.clientSequenceNumber,
                    message.contents,
                    message.metadata);
            });

            pendingStateManager.onFlush();
        };

        const process = (messages: Partial<ISequencedDocumentMessage>[]) =>
            messages.forEach((message) => {
                pendingStateManager.processPendingLocalMessage(message);
            });

        it("proper batch is processed correctly", () => {
            const messages: Partial<ISequencedDocumentMessage>[] = [
                {
                    clientId,
                    type: MessageType.Operation,
                    clientSequenceNumber: 0,
                    referenceSequenceNumber: 0,
                    metadata: { batch: true },
                }, {
                    clientId,
                    type: MessageType.Operation,
                    clientSequenceNumber: 1,
                    referenceSequenceNumber: 0,
                }, {
                    clientId,
                    type: MessageType.Operation,
                    metadata: { batch: false },
                    clientSequenceNumber: 2,
                    referenceSequenceNumber: 0,
                },
            ];

            submitBatch(messages);
            process(messages);
            assert(closeError === undefined);
        });

        it("batch missing end message will call close", () => {
            const messages: Partial<ISequencedDocumentMessage>[] = [
                {
                    clientId,
                    type: MessageType.Operation,
                    clientSequenceNumber: 0,
                    referenceSequenceNumber: 0,
                    metadata: { batch: true },
                }, {
                    clientId,
                    type: MessageType.Operation,
                    clientSequenceNumber: 1,
                    referenceSequenceNumber: 0,
                },
            ];

            submitBatch(messages);
            process(messages);
            assert(closeError instanceof DataProcessingError);
            assert.strictEqual(closeError.getTelemetryProperties().hasBatchStart, true);
            assert.strictEqual(closeError.getTelemetryProperties().hasBatchEnd, false);
        });

        it("processing out of sync messages will call close", () => {
            const messages: Partial<ISequencedDocumentMessage>[] = [
                {
                    clientId,
                    type: MessageType.Operation,
                    clientSequenceNumber: 0,
                    referenceSequenceNumber: 0,
                },
            ];

            submitBatch(messages);
            process(messages.map((message) => ({
                ...message,
                clientSequenceNumber: (message.clientSequenceNumber ?? 0) + 1,
            })));
            assert(closeError instanceof DataProcessingError);
            assert.strictEqual(closeError.getTelemetryProperties().expectedClientSequenceNumber, 0);
        });
    });
});
