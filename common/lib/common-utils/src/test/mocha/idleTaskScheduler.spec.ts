/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "assert";
import { scheduleIdleTask } from "../../idleTaskScheduler";

describe("Idle task scheduler", () => {
    function someTask(x: number): void {
        if (x < 10) {
            throw new Error("Something awful happened");
        }
    }

    it("Should schedule and run a synchronous task during idle time", () => {
        let success = false;
        scheduleIdleTask(() => {
            someTask(4);
        }, 1000)
            .then(val => {
                assert(val)
                success = true;
            })
            .catch((err) => {
                console.log(err);
            });
        assert(success);
    });

    it("Should fall back to setTimeout when idle Task API is not available", () => {
        let success = false;
        setTimeout(() => {
            try {
                someTask(4);
                success = true;
            } catch (e) {
                console.log(e);
            }
            assert(success);
        }, 1000);
    });
});
