/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import "mocha";
import { strict as assert } from "assert";
import {
    MockFluidDataStoreRuntime, MockContainerRuntimeFactory, MockStorage,
} from "@fluidframework/test-runtime-utils";
import { SharedLog } from "../src/log";
import { SharedLogFactory } from "../src/factory";
import { leafSize, blockSize } from "../src/types";

describe("SharedLog", () => {
    describe("SharedLog in local state", () => {
        let log: SharedLog;
        let dataStoreRuntime: MockFluidDataStoreRuntime;

        beforeEach(async () => {
            dataStoreRuntime = new MockFluidDataStoreRuntime();
            dataStoreRuntime.local = true;
            log = new SharedLog("log", dataStoreRuntime, SharedLogFactory.Attributes);
            assert.equal(log.length, 0);
        });

        it("Can create a log", () => {
            assert.ok(log, "Could not create a log");
        });
    });

    describe("attached", () => {
        let log: SharedLog;
        let containterRuntimeFactory: MockContainerRuntimeFactory;

        beforeEach(() => {
            containterRuntimeFactory = new MockContainerRuntimeFactory();

            // Create and connect the first SharedMatrix.
            const dataStoreRuntime1 = new MockFluidDataStoreRuntime();
            log = new SharedLog("log", dataStoreRuntime1, SharedLogFactory.Attributes);
            log.connect({
                deltaConnection: containterRuntimeFactory
                    .createContainerRuntime(dataStoreRuntime1)
                    .createDeltaConnection(),
                objectStorage: new MockStorage(),
            });

            assert.equal(log.length, 0);
        });

        it("read after evict", async () => {
            for (let i = 0; i < leafSize + 1; i++) {
                // Append the entry
                log.push(i);
            }

            containterRuntimeFactory.processAllMessages();

            // Defer to allow the blob upload microtask to complete and evict
            // the first leaf of the log.
            await Promise.resolve();

            // Ensure that attempting to read the item throws a promise.
            assert.throws(() => {
                log.getItem(0);
            }, (error) => typeof error.then === "function");

            // Await the completion of the blob fetch and vet that we get the
            // original item back.
            const actual = await log.awaitItem(0);

            assert.equal(actual, 0);
        });

        it("Works big", function () {
            this.timeout(150000);

            for (let i = 0; i < (blockSize * leafSize + 1); i++) {
                // Append the entry
                log.push(i);

                // Initially, the new entry is unacked
                assert.equal(log.ackedLength, i);
                assert.equal(log.length, i + 1);

                // Ensure we can read the unacked entry (currenly stored in the pending list)
                assert.equal(log.getItem(i), i);

                // Processes the ack message
                containterRuntimeFactory.processAllMessages();

                // Entry should now be acked
                assert.equal(log.ackedLength, i + 1);
                assert.equal(log.length, i + 1);

                // Ensure we can still read it (now stored in the B-Tree)
                assert.equal(log.getItem(i), i);
            }
        });
    });
});
