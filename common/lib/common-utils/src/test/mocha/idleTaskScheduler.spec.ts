/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "assert";
import { SinonFakeTimers, useFakeTimers } from "sinon";
import * as idleTask from "../../idleTaskScheduler";

describe("Idle task scheduler", () => {
    let clock: SinonFakeTimers;

    before(() => {
        clock = useFakeTimers();
    });

    afterEach(() => {
        clock.reset();
    });

    after(() => {
        clock.restore();
    });

    function someTask(x: number): boolean {
        return x > 3 ? true : false;
    }

    it("Should schedule and run a synchronous task during idle time", async () => {
        const promise = idleTask.scheduleIdleTask(() => {
            return someTask(5);
        }, 1000);

        clock.tick(1100);
        return promise.then((result) => assert(result));
    });

    it("Should fall back to setTimeout when idle Task API is not available", async () => {
        let success = false;
        await new Promise((resolve, reject) => {
            try {
                resolve(async () => {
                    await idleTask.scheduleIdleTask(() => {
                        someTask(5);
                    }, 1000);
                    clock.tick(1100);
                });
            } catch (e) {
                reject(e);
            }
        }).then(() => {
            success = true;
        });
        assert(success);
    });
});
