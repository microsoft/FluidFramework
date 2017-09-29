/**
 * The rate limiter is a simple class that will defer running an async action
 */
export class RateLimiter {
    private pending = false;
    private dirty = false;

    constructor(private action: () => Promise<any>, private rate: number) {
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

        // No pending and it's been at least the given amount of time between action
        const completeP = this.action().catch((error) => {
            // TODO we will just log errors for now. Will want a better strategy later on (replay, wait).
            if (error) {
                console.error(error);
            }
        });

        // Finally clause to start snapshotting again once we finish
        completeP.then(() => {
            // Wait rate amount of time before resolving to limit the udpate flow
            setTimeout(() => {
                this.pending = false;
                if (this.dirty) {
                    this.trigger();
                }
            }, this.rate);
        });
    }
}
