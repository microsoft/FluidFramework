/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { EventEmitter } from "events";

/**
 * The rate limiter is a simple class that will defer running an async action
 */
export class RateLimiter extends EventEmitter {
    private pending = false;
    private dirty = false;
    private running = false;
    private triggerTimer: ReturnType<typeof setTimeout> | null = null;

    constructor(private readonly action: () => Promise<any>, private readonly rate: number) {
        super();
    }

    public trigger() {
        // TODO having an idle time might be good so that we run an insight immediately when a document/object
        // coalesces
        // I might want to have an idle time combined with a max wait time

        // If we have a pending operation in flight or a timer in play to limit the rate simply mark
        // that another update has come in
        if (this.pending) {
            this.dirty = true;
            return;
        }

        // Mark ourselves pending and clear the dirty flag
        this.dirty = false;
        this.pending = true;
        this.running = true;

        // No pending and it's been at least the given amount of time between action
        const completeP = this.action().catch((error) => {
            // TODO we will just log errors for now. Will want a better strategy later on (replay, wait).
            if (error) {
                console.error("Rate limit error", error);
            }
        });

        // Finally clause to start running tasks again once we finish
        // eslint-disable-next-line @typescript-eslint/no-floating-promises
        completeP.then(() => {
            this.running = false;
            this.emit("done");
            // Wait rate amount of time before resolving to limit the update flow
            this.triggerTimer = setTimeout(() => {
                this.pending = false;
                if (this.dirty) {
                    this.trigger();
                }
            }, this.rate);
        });
    }

    public get isRunning() {
        return this.running;
    }

    public stop() {
        if (!this.triggerTimer) {
            return;
        }
        clearTimeout(this.triggerTimer);
        this.triggerTimer = null;
    }
}
