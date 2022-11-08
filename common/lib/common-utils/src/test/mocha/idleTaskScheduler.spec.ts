/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "assert";
import { scheduleIdleTask } from "../../idleTaskScheduler";

describe("Idle task scheduler", () => {
    function someTask(x: number): void {
        if (x < 3) {
            throw new Error("Something awful happened");
        }
    }

    it("Should schedule and run a synchronous task during idle time", async () => {
        let success = false;
        await scheduleIdleTask(() => {
            someTask(5);
        }, 1000)
            .then(() => {
                success = true;
            })
            .catch((err) => {
                console.log(err);
            });
        assert(success);
    });

    it("Should fall back to setTimeout when idle Task API is not available", async () => {
        let success = false;
        await new Promise((resolve, reject) => {
            setTimeout(() => {
                try {
                    resolve(someTask(5));
                } catch (e) {
                    reject(e);
                }
            }, 1000);
        }).then(() => {
            success = true;
        });
        assert(success);
    });
});
