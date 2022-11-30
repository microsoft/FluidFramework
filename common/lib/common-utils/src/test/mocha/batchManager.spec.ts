/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "assert";
import { BatchManager } from "../..";

describe("Routerlicious", () => {
    describe("Utils", () => {
        describe("BatchManager", () => {
            let batchManager: BatchManager<any>;
            let pending: { [key: string]: any[][] };

            beforeEach(() => {
                pending = {};
                batchManager = new BatchManager<any>((id, work) => {
                    if (!(id in pending)) {
                        pending[id] = [];
                    }

                    pending[id].push(work);
                });
            });

            describe(".add()", () => {
                it("Should be able to add pending work", async () => {
                    const batchSize = 100;
                    const testId = "test";

                    for (let i = 0; i < batchSize; i++) {
                        batchManager.add(testId, i);
                    }
                    batchManager.drain();

                    assert.ok(testId in pending);
                    assert.equal(pending[testId].length, 1);
                    assert.equal(pending[testId][0].length, batchSize);
                });
            });
        });
    });
});
