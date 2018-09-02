import * as utils from "@prague/utils";
import * as assert from "assert";

describe("Routerlicious", () => {
    describe("Utils", () => {
        describe("BatchManager", () => {
            let batchManager: utils.BatchManager<any>;
            let pending: { [key: string]: any[][] };

            beforeEach(() => {
                pending = {};
                batchManager = new utils.BatchManager<any>((id, work) => {
                    if (!(id in pending)) {
                        pending[id] = [];
                    }

                    pending[id].push(work);
                });
            });

            describe(".add()", async () => {
                it("Should be able to add pending work", async () => {
                    const batchSize = 100;
                    const testId = "test";

                    for (let i = 0; i < batchSize; i++) {
                        batchManager.add(testId, i);
                    }
                    await batchManager.drain();

                    assert.ok(testId in pending);
                    assert.equal(pending[testId].length, 1);
                    assert.equal(pending[testId][0].length, batchSize);
                });
            });
        });
    });
});
