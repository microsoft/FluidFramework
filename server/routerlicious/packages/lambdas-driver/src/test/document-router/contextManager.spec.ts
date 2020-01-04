/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { IContext, IKafkaMessage } from "@microsoft/fluid-server-services-core";
import * as assert from "assert";
import { DocumentContextManager } from "../../document-router/contextManager";
import { getOrCreateMessage, clearMessages } from "./testDocumentLambda";

class TestContext implements IContext {
    public offset = -1;

    public checkpoint(message: IKafkaMessage) {
        assert(message.offset >= this.offset, `${message.offset} >= ${this.offset}`);
        this.offset = message.offset;
    }

    public error(error: any, restart: boolean) {
        throw new Error("Method not implemented.");
    }
}

describe("document-router", () => {
    describe("DocumentContextManager", () => {
        let testContext: TestContext;
        let testContextManager: DocumentContextManager;

        beforeEach(async () => {
            clearMessages();
            testContext = new TestContext();
            testContextManager = new DocumentContextManager(testContext);
        });

        describe(".createContext", () => {
            it("Should be able to create and then track a document context", () => {
                // Create an initial context
                testContextManager.setHead(getOrCreateMessage(0));
                const context = testContextManager.createContext(getOrCreateMessage(0));
                testContextManager.setTail(getOrCreateMessage(0));

                // Move the head offset and update the context to match
                testContextManager.setHead(getOrCreateMessage(5));
                context.setHead(getOrCreateMessage(5));
                context.checkpoint(getOrCreateMessage(5));
                testContextManager.setTail(getOrCreateMessage(5));

                // Validate we are at the checkpointed context
                assert.equal(testContext.offset, 5);
            });

            it("Should be able to create and track multiple document contexts", () => {
                // Create an initial context
                testContextManager.setHead(getOrCreateMessage(0));
                const context0 = testContextManager.createContext(getOrCreateMessage(0));
                testContextManager.setTail(getOrCreateMessage(0));

                // And then a second one
                testContextManager.setHead(getOrCreateMessage(5));
                const context1 = testContextManager.createContext(getOrCreateMessage(5));
                testContextManager.setTail(getOrCreateMessage(5));

                // Third context
                testContextManager.setHead(getOrCreateMessage(10));
                const context2 = testContextManager.createContext(getOrCreateMessage(10));
                testContextManager.setTail(getOrCreateMessage(10));

                // Offset should still be unset
                assert.equal(testContext.offset, -1);

                // New message and checkpoint the first context at the initial message.
                // Overall checkpoint still unaffected
                testContextManager.setHead(getOrCreateMessage(12));
                context0.setHead(getOrCreateMessage(12));
                context0.checkpoint(getOrCreateMessage(0));
                testContextManager.setTail(getOrCreateMessage(12));
                assert.equal(testContext.offset, 0);

                // New message and checkpoint the second message at the initial message.
                // Overall checkpoint still unaffected
                testContextManager.setHead(getOrCreateMessage(15));
                context1.setHead(getOrCreateMessage(15));
                context1.checkpoint(getOrCreateMessage(5));
                testContextManager.setTail(getOrCreateMessage(15));
                assert.equal(testContext.offset, 0);

                // Checkpoint the third context at its head - this should have the checkpoint be at the 0th
                // context's tail since it's the earliest
                context2.checkpoint(getOrCreateMessage(10));
                assert.equal(testContext.offset, 0);

                // Checkpoint the first context at its head. This will make the second context the latest
                context0.checkpoint(getOrCreateMessage(12));
                assert.equal(testContext.offset, 5);

                // Update the manager location - the second context is not caught up so will hold the checkpoint offset
                testContextManager.setHead(getOrCreateMessage(20));
                testContextManager.setTail(getOrCreateMessage(20));
                assert.equal(testContext.offset, 5);

                // Move the second context to the head. This will make the manager's offset take over
                context1.checkpoint(getOrCreateMessage(15));
                assert.equal(testContext.offset, 20);
            });

            it("Should correctly compute the checkpointed offset after contexts switch pending work state", () => {
                // Create an initial context
                testContextManager.setHead(getOrCreateMessage(0));
                const context = testContextManager.createContext(getOrCreateMessage(0));
                testContextManager.setTail(getOrCreateMessage(0));

                // Checkpoint the main context at a later point - having it no longer have pending work
                testContextManager.setHead(getOrCreateMessage(12));
                context.setHead(getOrCreateMessage(12));
                context.checkpoint(getOrCreateMessage(12));
                testContextManager.setTail(getOrCreateMessage(12));

                // Move the overall offsets - context having no pending work will have it not affect the offset
                // computation
                testContextManager.setHead(getOrCreateMessage(20));
                testContextManager.setTail(getOrCreateMessage(20));
                assert.equal(testContext.offset, 20);

                // Update context's head. This will transition it from no work to having pending work (the new head
                // at offset 25).
                testContextManager.setHead(getOrCreateMessage(25));
                context.setHead(getOrCreateMessage(25));
                testContextManager.setTail(getOrCreateMessage(25));
                assert.equal(testContext.offset, 24);
            });

            it("Should ignore contexts without pending work", () => {
                // Create an initial context
                testContextManager.setHead(getOrCreateMessage(0));
                const context = testContextManager.createContext(getOrCreateMessage(0));
                context.checkpoint(getOrCreateMessage(0));
                testContextManager.setTail(getOrCreateMessage(0));

                // Move the manager's locations but keep the context static
                testContextManager.setHead(getOrCreateMessage(5));
                testContextManager.setTail(getOrCreateMessage(5));

                // Validate we are at the checkpointed context
                assert.equal(testContext.offset, 5);
            });

            it("Should not checkpoint until the starting offset changes", () => {
                // Create an initial context and verify no change to the checkpoint offset
                testContextManager.setHead(getOrCreateMessage(0));
                testContextManager.createContext(getOrCreateMessage(0));
                testContextManager.setTail(getOrCreateMessage(0));
                assert.equal(testContext.offset, -1);

                // Move the manager's locations and verify no change to the checkpoint offset
                testContextManager.setHead(getOrCreateMessage(5));
                testContextManager.setTail(getOrCreateMessage(5));
                assert.equal(testContext.offset, -1);
            });

            it("Should emit an error if a created context emits an error", async () => {
                testContextManager.setHead(getOrCreateMessage(0));
                const context = testContextManager.createContext(getOrCreateMessage(0));
                testContextManager.setTail(getOrCreateMessage(0));

                return new Promise<void>((resolve, reject) => {
                    testContextManager.on("error", (error, restart) => {
                        assert.ok(error);
                        assert.ok(restart);
                        resolve();
                    });

                    context.error("Test Error", true);
                });
            });
        });
    });
});
