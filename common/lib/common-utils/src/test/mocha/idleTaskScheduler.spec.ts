/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "assert";
import { scheduleIdleTask } from "../../idleTaskScheduler";

describe("Idle task scheduler", () => {

    function someTask(x: number): void {
        if (x < 10) {
            console.log("errror")
            throw new Error("Something awful happened");
        };
    }

    it("Should schedule and run a synchronous task during idle time", () => {
        assert.equal(4,5);
        scheduleIdleTask(() => { someTask(4) }, 1000).then( val => {
            assert.strictEqual(val, 4);
        }).catch((err) => {
            console.log(err);
        })

    });

    it("Should fall back to setTimeout when idle Task API is not available", () => {
        assert.equal(4,5);

    });

});
