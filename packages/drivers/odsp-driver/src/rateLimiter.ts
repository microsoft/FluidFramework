/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { assert } from "@fluidframework/common-utils";

export class RateLimiter {
    private readonly tasks: (() => void)[] = [];
    private count: number;

    constructor(count: number) {
        this.count = count;
    }

    public get waitQueueLength(): number {
        return this.tasks.length;
    }

    private sched() {
        if (this.count > 0 && this.tasks.length > 0) {
            this.count--;
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
                        this.count++;
                        this.sched();
                    }
                });
            };
            this.tasks.push(task);
            if (process && process.nextTick) {
                process.nextTick(this.sched.bind(this));
            } else {
                setImmediate(this.sched.bind(this));
            }
        });
    }

    public async schedule<T>(f: () => Promise<T>) {
        return this.acquire()
        .then(async (release) => {
            return f()
            .then((res) => {
                release();
                return res;
            })
            .catch((err) => {
                release();
                throw err;
            });
        });
    }
}
