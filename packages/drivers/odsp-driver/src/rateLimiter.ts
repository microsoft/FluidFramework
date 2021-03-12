/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { assert } from "@fluidframework/common-utils";

export class RateLimiter {
    private readonly tasks: (() => void)[] = [];
    constructor(private maxRequests: number) {
        assert(maxRequests > 0, "Tried to create rate limiter with 0 max requests!");
    }

    public get waitQueueLength(): number {
        return this.tasks.length;
    }

    // Run when one of the tasks finished running.
    // Release next task if we have one, or allow more tasks to run in future.
    protected readonly release = () => {
        const task = this.tasks.shift();
        if (task !== undefined) {
            return task();
        }
        this.maxRequests++;
    };

    protected async acquire() {
        if (this.maxRequests > 0) {
            this.maxRequests--;
            return;
        }

        return new Promise<void>((res) => {
            this.tasks.push(res);
        });
    }

    public async schedule<T>(work: () => Promise<T>) {
        await this.acquire();
        return work().finally(this.release);
    }
}
