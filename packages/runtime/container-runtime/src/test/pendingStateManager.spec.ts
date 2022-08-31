/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import assert from "assert";
import { FlushMode } from "@fluidframework/runtime-definitions";
import { ICriticalContainerError } from "@fluidframework/container-definitions";
import { ISequencedDocumentMessage, MessageType } from "@fluidframework/protocol-definitions";
import { DataProcessingError } from "@fluidframework/container-utils";
import { PendingStateManager } from "../pendingStateManager";
import { ContainerMessageType } from "..";

describe("Pending State Manager", () => {
    describe("Rollback", () => {
        let rollbackCalled;
        let rollbackContent;
        let closeCalled;
        let rollbackShouldThrow;
        let pendingStateManager;

        beforeEach(async () => {
            rollbackCalled = false;
            rollbackContent = [];
            closeCalled = false;
            rollbackShouldThrow = false;
            pendingStateManager = new PendingStateManager({
                applyStashedOp: () => { throw new Error(); },
                clientId: () => undefined,
                close: () => closeCalled = true,
                connected: () => true,
                flush: () => { },
                flushMode: () => FlushMode.Immediate,
                reSubmit: () => { },
                rollback: (type, content, metadata) => {
                    rollbackCalled = true;
                    rollbackContent.push(content);
                    if (rollbackShouldThrow) {
                        throw new Error();
                    }
                },
                setFlushMode: () => { },
            }, FlushMode.Immediate, undefined);
        });

        it("should do nothing when rolling back empty pending stack", () => {
            const checkpoint = pendingStateManager.checkpoint();
            checkpoint.rollback();

            assert.strictEqual(rollbackCalled, false);
            assert.strictEqual(closeCalled, false);
            assert.strictEqual(pendingStateManager.hasPendingMessages(), false);
        });

        it("should do nothing when rolling back nothing", () => {
            pendingStateManager.onSubmitMessage(ContainerMessageType.Alias, 1, 1, undefined, undefined, undefined);
            const checkpoint = pendingStateManager.checkpoint();
            checkpoint.rollback();

            assert.strictEqual(rollbackCalled, false);
            assert.strictEqual(closeCalled, false);
            assert.strictEqual(pendingStateManager.hasPendingMessages(), true);
        });

        it("should succeed when rolling back entire pending stack", () => {
            const checkpoint = pendingStateManager.checkpoint();
            pendingStateManager.onSubmitMessage(ContainerMessageType.Alias, 1, 1, 11, undefined, undefined);
            pendingStateManager.onSubmitMessage(ContainerMessageType.Alias, 1, 1, 22, undefined, undefined);
            pendingStateManager.onSubmitMessage(ContainerMessageType.Alias, 1, 1, 33, undefined, undefined);
            checkpoint.rollback();

            assert.strictEqual(rollbackCalled, true);
            assert.strictEqual(rollbackContent.length, 3);
            assert.strictEqual(rollbackContent[0], 33);
            assert.strictEqual(rollbackContent[1], 22);
            assert.strictEqual(rollbackContent[2], 11);
            assert.strictEqual(closeCalled, false);
            assert.strictEqual(pendingStateManager.hasPendingMessages(), false);
        });

        it("should succeed when rolling back part of pending stack", () => {
            pendingStateManager.onSubmitMessage(ContainerMessageType.Alias, 1, 1, 11, undefined, undefined);
            const checkpoint = pendingStateManager.checkpoint();
            pendingStateManager.onSubmitMessage(ContainerMessageType.Alias, 1, 1, 22, undefined, undefined);
            pendingStateManager.onSubmitMessage(ContainerMessageType.Alias, 1, 1, 33, undefined, undefined);
            checkpoint.rollback();

            assert.strictEqual(rollbackCalled, true);
            assert.strictEqual(rollbackContent.length, 2);
            assert.strictEqual(rollbackContent[0], 33);
            assert.strictEqual(rollbackContent[1], 22);
            assert.strictEqual(closeCalled, false);
            assert.strictEqual(pendingStateManager.hasPendingMessages(), true);
        });

        it("should throw and close when rollback fails", () => {
            rollbackShouldThrow = true;
            const checkpoint = pendingStateManager.checkpoint();
            pendingStateManager.onSubmitMessage(ContainerMessageType.Alias, 1, 1, 11, undefined, undefined);
            assert.throws(() => { checkpoint.rollback(); });

            assert.strictEqual(rollbackCalled, true);
            assert.strictEqual(closeCalled, true);
        });

        it("should throw and close when rolling back pending state type is not message", () => {
            const checkpoint = pendingStateManager.checkpoint();
            pendingStateManager.onFlushModeUpdated(FlushMode.TurnBased);
            assert.throws(() => { checkpoint.rollback(); });

            assert.strictEqual(rollbackCalled, false);
            assert.strictEqual(closeCalled, true);
        });
    });

    describe("Op processing", () => {
        let pendingStateManager;
        let closeError: ICriticalContainerError | undefined;
        const clientId = "clientId";

        beforeEach(async () => {
            pendingStateManager = new PendingStateManager({
                applyStashedOp: () => { throw new Error(); },
                clientId: () => clientId,
                close: (error?: ICriticalContainerError) => closeError = error,
                connected: () => true,
                flush: () => { },
                flushMode: () => FlushMode.TurnBased,
                reSubmit: () => { },
                rollback: () => { },
                setFlushMode: () => { },
            }, FlushMode.TurnBased, undefined);
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

        it("batch missing begin message will call close", () => {
            const messages: Partial<ISequencedDocumentMessage>[] = [
                {
                    clientId,
                    type: MessageType.Operation,
                    clientSequenceNumber: 0,
                    referenceSequenceNumber: 0,
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
            assert(closeError instanceof DataProcessingError);
            assert.strictEqual(closeError.getTelemetryProperties().hasBatchStart, false);
            assert.strictEqual(closeError.getTelemetryProperties().hasBatchEnd, true);
        });

        it("batch missing markers will call close", () => {
            const messages: Partial<ISequencedDocumentMessage>[] = [
                {
                    clientId,
                    type: MessageType.Operation,
                    clientSequenceNumber: 0,
                    referenceSequenceNumber: 0,
                }, {
                    clientId,
                    type: MessageType.Operation,
                    clientSequenceNumber: 1,
                    referenceSequenceNumber: 0,
                }, {
                    clientId,
                    type: MessageType.Operation,
                    clientSequenceNumber: 2,
                    referenceSequenceNumber: 0,
                },
            ];

            submitBatch(messages);
            process(messages);
            assert(closeError instanceof DataProcessingError);
            assert.strictEqual(closeError.getTelemetryProperties().hasBatchStart, false);
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
