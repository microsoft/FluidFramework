/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import assert from "assert";
import { TestThrottler, TestThrottleManager } from "@fluidframework/server-test-utils";
import { ThrottlerHelper } from "../throttlerHelper";
import { ThrottlerRequestType } from "@fluidframework/server-services-core";
import Sinon from "sinon";


describe("ThrottlerHelper", () => {
    beforeEach(() => {
        // use fake timers to have full control over the passage of time
        Sinon.useFakeTimers();
    });

    beforeEach(() => {
        Sinon.restore();
    });

    it("placeholder", () => {
        const throttleManager = new TestThrottleManager();
        // Max 10 requests per second
        const throttler = new TestThrottler(throttleManager, 10, 100);
        const throttlerHelper = new ThrottlerHelper(throttler, 10);


        assert.doesNotThrow(() => {
            throttlerHelper.openRequest("test1", ThrottlerRequestType.AlfredHttps);
        });
    });
});
