/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import process from "process";
import { assert } from "@fluidframework/common-utils";

export class RateLimiter {
    private readonly tasks: (() => void)[] = [];
    constructor(private maxRequests: number) {}

    public get waitQueueLength(): number {
        const diff = this.tasks.length - this.maxRequests;
        if (diff > 0) {
            return diff;
        }
        return 0;
    }

    private sched() {
        if (this.maxRequests > 0 && this.tasks.length > 0) {
            this.maxRequests--;
            const task = this.tasks.shift();
            assert(task !== undefined, "Unexpected task value in tasks list");
            task();
        }
    }

    public async acquire() {
        return new Promise<() => void>((res, rej) => {
            const task = () => {
                let released = false;
                res(() => {
                    if (!released) {
                        released = true;
                        this.maxRequests++;
                        this.sched();
                    }
                });
            };
            this.tasks.push(task);
            process.nextTick(this.sched.bind(this));
        });
    }

    public async schedule<T>(work: () => Promise<T>) {
        return this.acquire()
        .then(async (release) => {
            return work()
            .then((res) => {
                release();
                return res;
            })
            .catch((error) => {
                release();
                throw error;
            });
        });
    }
}
