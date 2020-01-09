/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import * as assert from "assert";
import { DocumentContext } from "../../document-router/documentContext";
import { TestKafka } from "@microsoft/fluid-server-test-utils";

function validateException(fn: () => void) {
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
            testContext = new DocumentContext(TestKafka.createdQueuedMessage(0), TestKafka.createdQueuedMessage(-1));
        });

        describe(".setHead", () => {
            it("Should be able to set a new head offset", () => {
                assert.equal(0, testContext.head.offset);
                testContext.setHead(TestKafka.createdQueuedMessage(1));
                assert.equal(1, testContext.head.offset);
            });

            it("Should assert if new head is equal to existing head", () => {
                validateException(() => testContext.setHead(TestKafka.createdQueuedMessage(0)));
            });

            it("Should assert if new head is less than existing head", () => {
                validateException(() => testContext.setHead(TestKafka.createdQueuedMessage(-5)));
            });
        });

        describe(".checkpoint", () => {
            it("Should be able to update the head offset of the manager", () => {
                testContext.checkpoint(TestKafka.createdQueuedMessage(0));
                assert.equal(0, testContext.tail.offset);
                assert.ok(!testContext.hasPendingWork());
            });

            it("Should be able to checkpoint after adjusting the head", () => {
                testContext.setHead(TestKafka.createdQueuedMessage(10));
                testContext.checkpoint(TestKafka.createdQueuedMessage(5));
                assert.equal(5, testContext.tail.offset);
                testContext.setHead(TestKafka.createdQueuedMessage(15));
                testContext.checkpoint(TestKafka.createdQueuedMessage(10));
                assert.equal(10, testContext.tail.offset);
                testContext.checkpoint(TestKafka.createdQueuedMessage(15));
                assert.equal(15, testContext.tail.offset);
                assert.ok(!testContext.hasPendingWork());
            });

            it("Should assert if checkpoint is less than tail", () => {
                validateException(() => testContext.checkpoint(TestKafka.createdQueuedMessage(0)));
            });

            it("Should assert if checkpoint is equal to tail", () => {
                validateException(() => testContext.checkpoint(TestKafka.createdQueuedMessage(-1)));
            });

            it("Should assert if checkpoint is greater than head", () => {
                validateException(() => testContext.checkpoint(TestKafka.createdQueuedMessage(1)));
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
