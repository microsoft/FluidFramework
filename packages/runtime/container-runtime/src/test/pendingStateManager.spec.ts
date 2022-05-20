/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import assert from "assert";
import { FlushMode } from "@fluidframework/runtime-definitions";
import { PendingStateManager } from "../pendingStateManager";
import { ContainerMessageType } from "..";

describe("Pending State Manager Rollback", () => {
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
            flush: () => {},
            flushMode: () => FlushMode.Immediate,
            reSubmit: () => {},
            rollback: (type, content, metadata) => {
                rollbackCalled = true;
                rollbackContent.push(content);
                if (rollbackShouldThrow) {
                    throw new Error();
                }
            },
            setFlushMode: () => {},
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
