import * as assert from "assert";
import { DocumentContext } from "../../document-router/documentContext";

function validateException(fn: Function) {
    try {
        fn();
        assert.ok(false);
    } catch (exception) {
        assert.ok(true);
    }
}

describe("document-router", () => {
    describe("DocumentContext", () => {
        let testContext: DocumentContext;

        beforeEach(async () => {
            testContext = new DocumentContext(0);
        });

        describe(".setHead", () => {
            it("Should be able to set a new head offset", () => {
                assert.equal(0, testContext.head);
                testContext.setHead(1);
                assert.equal(1, testContext.head);
            });

            it("Should assert if new head is equal to existing head", () => {
                validateException(() => testContext.setHead(0));
            });

            it("Should assert if new head is less than existing head", () => {
                validateException(() => testContext.setHead(-5));
            });
        });

        describe(".checkpoint", () => {
            it("Should be able to update the head offset of the manager", () => {
                testContext.checkpoint(0);
                assert.equal(0, testContext.tail);
                assert.ok(!testContext.hasPendingWork());
            });

            it("Should be able to checkpoint after adjusting the head", () => {
                testContext.setHead(10);
                testContext.checkpoint(5);
                assert.equal(5, testContext.tail);
                testContext.setHead(15);
                testContext.checkpoint(10);
                assert.equal(10, testContext.tail);
                testContext.checkpoint(15);
                assert.equal(15, testContext.tail);
                assert.ok(!testContext.hasPendingWork());
            });

            it("Should assert if checkpoint is less than tail", () => {
                validateException(() => testContext.checkpoint(0));
            });

            it("Should assert if checkpoint is equal to tail", () => {
                validateException(() => testContext.checkpoint(-1));
            });

            it("Should assert if checkpoint is greater than head", () => {
                validateException(() => testContext.checkpoint(1));
            });
        });

        describe(".error", () => {
            it("Should be able to update the head offset of the manager", async () => {
                return new Promise<void>((resolve, reject) => {
                    testContext.on("error", (error, restart) => {
                        assert.ok(error);
                        assert.equal(restart, true);
                        resolve();
                    });

                    testContext.error("Test error", true);
                });
            });
        });
    });
});
