/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import "mocha";
import { strict as assert } from "assert";
import {
    MockFluidDataStoreRuntime,
} from "@fluidframework/test-runtime-utils";
import { SharedLog } from "../src/log";
import { SharedLogFactory } from "../src/factory";

describe("SharedLog", () => {
    let log: SharedLog;
    let dataStoreRuntime: MockFluidDataStoreRuntime;

    beforeEach(async () => {
        dataStoreRuntime = new MockFluidDataStoreRuntime();
        log = new SharedLog("log", dataStoreRuntime, SharedLogFactory.Attributes);
    });

    describe("SharedLog in local state", () => {
        beforeEach(() => { dataStoreRuntime.local = true; });

        it("Can create a log", () => {
            assert.ok(log, "Could not create a log");
        });
    });
});
