import * as assert from "assert";
import { DocumentContextManager } from "../../document-router/contextManager";
import { IContext } from "../../kafka-service/lambdas";

class TestContext implements IContext {
    public offset = -1;

    public checkpoint(offset: number) {
        assert(offset >= this.offset, `${offset} >= ${this.offset}`);
        this.offset = offset;
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
            testContext = new TestContext();
            testContextManager = new DocumentContextManager(testContext);
        });

        describe(".createContext", () => {
            it("Should be able to create and then track a document context", () => {
                // Create an initial context
                testContextManager.setHead(0);
                const context = testContextManager.createContext(0);
                testContextManager.setTail(0);

                // Move the head offset and update the context to match
                testContextManager.setHead(5);
                context.setHead(5);
                context.checkpoint(5);
                testContextManager.setTail(5);

                // Validate we are at the checkpointed context
                assert.equal(testContext.offset, 5);
            });

            it("Should be able to create and track multiple document contexts", () => {
                // Create an initial context
                testContextManager.setHead(0);
                const context0 = testContextManager.createContext(0);
                testContextManager.setTail(0);

                // And then a second one
                testContextManager.setHead(5);
                const context1 = testContextManager.createContext(5);
                testContextManager.setTail(5);

                // Third context
                testContextManager.setHead(10);
                const context2 = testContextManager.createContext(10);
                testContextManager.setTail(10);

                // Offset should still be unset
                assert.equal(testContext.offset, -1);

                // New message and checkpoint the first context at the initial message.
                // Overall checkpoint still unaffected
                testContextManager.setHead(12);
                context0.setHead(12);
                context0.checkpoint(0);
                testContextManager.setTail(12);
                assert.equal(testContext.offset, -1);

                // New message and checkpoint the second message at the initial message.
                // Overall checkpoint still unaffected
                testContextManager.setHead(15);
                context1.setHead(15);
                context1.checkpoint(5);
                testContextManager.setTail(15);
                assert.equal(testContext.offset, -1);

                // Checkpoint the third context at its head - this should have the checkpoint be at the 0th
                // context's tail since it's the earliest
                context2.checkpoint(10);
                assert.equal(testContext.offset, 0);

                // Checkpoint the first context at its head. This will make the second context the latest
                context0.checkpoint(12);
                assert.equal(testContext.offset, 5);

                // Update the manager location - the second context is not caught up so will hold the checkpoint offset
                testContextManager.setHead(20);
                testContextManager.setTail(20);
                assert.equal(testContext.offset, 5);

                // Move the second context to the head. This will make the manager's offset take over
                context1.checkpoint(15);
                assert.equal(testContext.offset, 20);
            });

            it("Should ignore contexts without pending work", () => {
                // Create an initial context
                testContextManager.setHead(0);
                const context = testContextManager.createContext(0);
                context.checkpoint(0);
                testContextManager.setTail(0);

                // Move the manager's locations but keep the context static
                testContextManager.setHead(5);
                testContextManager.setTail(5);

                // Validate we are at the checkpointed context
                assert.equal(testContext.offset, 5);
            });

            it("Should not checkpoint until the starting offset changes", () => {
                // Create an initial context and verify no change to the checkpoint offset
                testContextManager.setHead(0);
                testContextManager.createContext(0);
                testContextManager.setTail(0);
                assert.equal(testContext.offset, -1);

                // Move the manager's locations and verify no change to the checkpoint offset
                testContextManager.setHead(5);
                testContextManager.setTail(5);
                assert.equal(testContext.offset, -1);
            });

            it("Should emit an error if a created context emits an error", async () => {
                testContextManager.setHead(0);
                const context = testContextManager.createContext(0);
                testContextManager.setTail(0);

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
