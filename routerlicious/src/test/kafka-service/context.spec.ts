import * as assert from "assert";
import { CheckpointManager } from "../../kafka-service/checkpointManager";
import { Context } from "../../kafka-service/context";
import { TestConsumer, TestKafka } from "../testUtils";

describe("kafka-service", () => {
    describe("Context", () => {
        let testConsumer: TestConsumer;
        let testContext: Context;
        let checkpointManager: CheckpointManager;

        beforeEach(() => {
            const testKafka = new TestKafka();
            testConsumer = testKafka.createConsumer();
            checkpointManager = new CheckpointManager(0, testConsumer);
            testContext = new Context(checkpointManager);
        });

        describe(".checkpoint", () => {
            it("Should be able to checkpoint at a given offset", async () => {
                testContext.checkpoint(10);
                testContext.checkpoint(30);
                await testConsumer.waitForOffset(30);
            });
        });

        describe(".close", () => {
            it("Should emit a close event", async () => {
                const testError = null;
                const testRestart = true;

                const closedP = testContext.addListener("close", (error, restart) => {
                    assert.equal(error, testError);
                    assert.equal(restart, testRestart);
                });
                testContext.close(testError, testRestart);

                await closedP;
            });
        });
    });
});
