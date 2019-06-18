/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

export class Scheduler {
    private numVsyncPending = 0;
    private maxVsyncPending = 2;
    private previousCallback = Promise.resolve();
    private lastScheduled = 0;
    private idleThreshold = 500;

    constructor(
        private readonly callback: () => Promise<void>,
        private readonly idle: () => Promise<void>
    ) {
    }

    private readonly checkIdle = async (idleScheduled) => {
        if (idleScheduled !== this.lastScheduled) {
            return;
        }

        const elapsed = Date.now() - this.lastScheduled;
        console.log(`remaining(${idleScheduled}): ${elapsed}`)
        if (elapsed < this.idleThreshold) {
            setTimeout(() => this.checkIdle(idleScheduled), this.idleThreshold - elapsed);
        } else {
            await this.idle();
        }
    };

    private readonly scheduleRaf = () => {
        return new Promise(resolve => {
            setTimeout(async () => {
                await this.previousCallback;
                this.previousCallback = this.callback();

                this.numVsyncPending--;
                if (this.numVsyncPending > 0) {
                    this.scheduleRaf();
                } else {
                    this.checkIdle(this.lastScheduled);
                }
                resolve(this.previousCallback);
            }, 8);
        });
    };

    public schedule() {
        this.lastScheduled = Date.now();

        if (this.numVsyncPending >= this.maxVsyncPending) {
            return;
        }

        this.numVsyncPending++;
        const result = this.scheduleRaf();
        return result;
    }
}