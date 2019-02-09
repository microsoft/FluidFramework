import * as testUtils from "@prague/test-utils";
import { CheckpointContext, ICheckpoint } from "../../deli/checkpointContext";

describe("Routerlicious", () => {
    describe("Deli", () => {
        describe("CheckpointContext", () => {
            const testId = "test";
            const testTenant = "test";
            let testCheckpointContext: CheckpointContext;
            let testCollection: testUtils.TestCollection;
            let testContext: testUtils.TestContext;

            function createCheckpoint(logOffset: number, sequenceNumber: number): ICheckpoint {
                return {
                    branchMap: null,
                    clients: null,
                    logOffset,
                    sequenceNumber,
                };
            }

            beforeEach(() => {
                testContext = new testUtils.TestContext();
                testCollection = new testUtils.TestCollection([{ documentId: testId, tenantId: testTenant }]);
                testCheckpointContext = new CheckpointContext(testTenant, testId, testCollection, testContext);
            });

            describe(".checkpoint", () => {
                it("Should be able to submit a new checkpoint", async () => {
                    testCheckpointContext.checkpoint(createCheckpoint(0, 0));
                    await testContext.waitForOffset(0);
                });

                it("Should be able to submit multiple checkpoints", async () => {
                    let i;
                    for (i = 0; i < 10; i++) {
                        testCheckpointContext.checkpoint(createCheckpoint(i, i));
                    }
                    await testContext.waitForOffset(i - 1);
                });
            });
        });
    });
});
