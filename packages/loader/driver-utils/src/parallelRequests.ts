/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */
import { assert, Deferred } from "@fluidframework/common-utils";
import { ITelemetryLogger } from "@fluidframework/common-definitions";

/**
 * Helper class to organize parallel fetching of data
 * It can be used to concurrently do many requests, while consuming
 * data in the right order. Take a look at UT for examples.
 * @param concurrency - level of concurrency
 * @param from - starting point of fetching data (inclusive)
 * @param to  - ending point of fetching data. exclusive, or undefined if unknown
 * @param payloadSize - batch size
 * @param logger - logger to use
 * @param requestCallback - callback to request batches
 * @returns - Queue that can be used to retrieve data
 */
export class ParallelRequests<T> {
    private latestRequested: number;
    private nextToDeliver: number;
    private readonly results: Map<number, T[]> = new Map();
    private working = true;
    private requestsInFlight = 0;
    private readonly endEvent = new Deferred<void>();
    private requests = 0;
    private readonly knewTo: boolean;

    constructor(
        from: number,
        private to: number | undefined,
        private readonly payloadSize: number,
        private readonly logger: ITelemetryLogger,
        private readonly requestCallback: (request: number, from: number, to: number, strongTo: boolean) =>
            Promise<{ partial: boolean, cancel: boolean, payload: T[] }>,
        private readonly responseCallback: (payload: T[]) => void)
    {
        this.latestRequested = from;
        this.nextToDeliver = from;
        this.knewTo = (to !== undefined);
    }

    public cancel() {
        this.working = false;
        this.endEvent.resolve();
    }

    public async run(concurrency: number) {
        assert(concurrency > 0, "invalid level of concurrency");
        assert(this.working, "trying to parallel run while not working");

        let c = concurrency;
        while (c > 0) {
            c--;
            this.addRequest();
        }
        this.dispatch();// will recalculate and trigger this.endEvent if needed
        return this.endEvent.promise;
    }

    private done() {
        // We should satisfy request fully.
        assert(this.to !== undefined, "undefined end point for parallel fetch");
        assert(this.nextToDeliver === this.to, "unexpected end point for parallel fetch");
        this.working = false;
        this.endEvent.resolve();
    }

    private fail(error) {
        this.working = false;
        this.endEvent.reject(error);
    }

    private dispatch() {
        while (this.working) {
            const value = this.results.get(this.nextToDeliver);
            if (value === undefined) {
                break;
            }
            this.results.delete(this.nextToDeliver);
            this.nextToDeliver += value.length;
            this.responseCallback(value);
        }

        // Account for cancellation - state might be not in consistent state on cancelling operation
        if (this.working) {
            assert(this.requestsInFlight !== 0 || this.results.size === 0,
                "in unexpected state after dispatching results");

            if (this.requestsInFlight === 0) {
                // we should have dispatched everything, no matter whether we knew about the end or not.
                // see comment in addRequestCore() around throwing away chunk if it's above this.to
                assert(this.results.size === 0,
                    "ending dispatch with remaining results to be sent");
                this.done();
            } else if (this.to !== undefined && this.nextToDeliver >= this.to) {
                // Learned about the end and dispatched all the ops up to it.
                // Ignore all the in-flight requests above boundary - unblock caller sooner.
                assert(!this.knewTo, "ending results dispatch but knew in advance about more requests");
                this.done();
            }
        }
    }

    private getNextChunk() {
        if (!this.working) {
            return undefined;
        }

        const from = this.latestRequested;
        if (this.to !== undefined) {
            if (this.to <= from) {
                return undefined;
            }
        }

        // this.latestRequested
        // inclusive on the right side! Exclusive on the left.
        this.latestRequested += this.payloadSize;

        if (this.to !== undefined) {
            this.latestRequested = Math.min(this.to, this.latestRequested);
        }

        assert(from < this.latestRequested, "unexpected next chunk position");

        return { from, to: this.latestRequested};
    }

    private addRequest() {
        const chunk = this.getNextChunk();
        if (chunk === undefined) {
            return;
        }
        this.addRequestCore(chunk.from, chunk.to).catch(this.fail.bind(this));
    }

    private async addRequestCore(fromArg: number, toArg: number) {
        assert(this.working, "cannot add parallel request while not working");

        let from = fromArg;
        let to = toArg;

        // to & from are exclusive
        this.requestsInFlight++;
        while (this.working) {
            const requestedLength = to - from;
            assert(requestedLength > 0, "invalid parallel request range");

            // We should not be wasting time asking for something useless.
            if (this.to !== undefined) {
                assert(from < this.to, "invalid parallel request start point");
                assert(to <= this.to, "invalid parallel request end point");
            }

            this.requests++;

            const promise = this.requestCallback(this.requests, from, to, this.to !== undefined);

            // dispatch any prior received data
            this.dispatch();

            const { payload, cancel, partial } = await promise;

            if (cancel) {
                this.cancel();
            }

            if (this.to !== undefined && from >= this.to) {
                // while we were waiting for response, we learned on what is the boundary
                // We can get here (with actual result!) if situation changed while this request was in
                // flight, i.e. the end was extended over what we learn in some other request
                // While it's useful not to throw this result, this is very corner cases and makes logic
                // (including consistency checks) much harder to write correctly.
                // So for now, we are throwing this result out the window.
                assert(!this.knewTo, "should not throw result if we knew about boundary in advance");
                // Learn how often it happens and if it's too wasteful to throw these chunks.
                // If it pops into our view a lot, we would need to reconsider how we approach it.
                // Note that this is not visible to user other than potentially not hitting 100% of
                // what we can in perf domain.
                if (payload.length !== 0) {
                    this.logger.sendErrorEvent({
                        eventName: "ParallelRequests_GotExtra",
                        from,
                        to,
                        end: this.to,
                        length: payload.length,
                    });
                }

                break;
            }

            if (this.working) {
                if (payload.length !== 0) {
                    this.results.set(from, payload);
                } else {
                    // 1. empty (partial) chunks should not be returned by various caching / adapter layers -
                    //    they should fall back to next layer. This might be important invariant to hold to ensure
                    //    that we are less likely have bugs where such layer would keep returning empty partial
                    //    result on each call.
                    // 2. Current invariant is that callback does retries until it gets something,
                    //    with the goal of failing if zero data is retrieved in given amount of time.
                    //    This is very specific property of storage / ops, so this logic is not here, but given only
                    //    one user of this class, we assert that to catch issues earlier.
                    // These invariant can be relaxed if needed.
                    assert(!partial, "empty/partial chunks should not be returned by caching");
                    assert(!this.knewTo, "callback should retry until valid fetch before it learns new boundary");
                }

                let fullChunk = (requestedLength <= payload.length); // we can possible get more than we asked.
                from += payload.length;

                if (!partial && !fullChunk) {
                    if (!this.knewTo) {
                        if (this.to === undefined || this.to > from) {
                            // The END
                            assert(!this.knewTo, "should not know futher boundary at end");
                            this.to = from;
                        }
                        break;
                    }
                    // We know that there are more items to be retrieved
                    // Can we get partial chunk? Ideally storage indicates that's not a full chunk
                    // Note that it's possible that not all ops hit storage yet.
                    // We will come back to request more, and if we can't get any more ops soon, it's
                    // catastrophic failure (see comment above on responsibility of callback to return something)
                    // This layer will just keep trying until it gets full set.
                    this.logger.sendErrorEvent({
                        eventName: "ParallelRequestsPartial",
                        from,
                        to,
                        length: payload.length,
                    });
                }

                if (to === this.latestRequested) {
                    // we can go after full chunk at the end if we received partial chunk, or more than asked
                    this.latestRequested = from;
                    fullChunk = true;
                }

                if (fullChunk) {
                    const chunk = this.getNextChunk();
                    if (chunk === undefined) { break; }
                    from = chunk.from;
                    to = chunk.to;
                }
            }
        }
        this.requestsInFlight--;
        this.dispatch();
    }
}

/**
 * Read interface for the Queue
 */
export interface IReadPipe<T> {
    pop(): Promise<T | undefined>;
}

/**
 * Helper queue class to allow async push / pull
 * It's essentially a pipe allowing multiple writers, and single reader
 */
export class Queue<T> implements IReadPipe<T> {
    private readonly queue: Promise<T | undefined>[] = [];
    private deferred: Deferred<T | undefined> | undefined;
    private done = false;

    public pushValue(value: T) {
        this.pushCore(Promise.resolve(value));
    }

    public pushError(error: any) {
        this.pushCore(Promise.reject(error));
        this.done = true;
    }

    public pushDone() {
        this.pushCore(Promise.resolve(undefined));
        this.done = true;
    }

    protected pushCore(value: Promise<T | undefined>) {
        assert(!this.done, "cannot push onto queue if done");
        if (this.deferred) {
            assert(this.queue.length === 0, "deferred queue should be empty");
            this.deferred.resolve(value);
            this.deferred = undefined;
        } else {
            this.queue.push(value);
        }
    }

    public async pop(): Promise<T | undefined> {
        assert(this.deferred === undefined, "cannot pop if deferred");
        const el = this.queue.shift();
        if (el !== undefined) {
            return el;
        }
        assert(!this.done, "queue should not be done during pop");
        this.deferred = new Deferred<T>();
        return this.deferred.promise;
    }
}

/**
 * Helper function to expose ParallelRequests through IReadPipe interface
 * @param concurrency - level of concurrency
 * @param from - starting point of fetching data (inclusive)
 * @param to  - ending point of fetching data. exclusive, or undefined if unknown
 * @param payloadSize - batch size
 * @param logger - logger to use
 * @param requestCallback - callback to request batches
 * @returns - Queue that can be used to retrieve data
 */
export function parallel<T>(
    concurrency: number,
    from: number,
    to: number | undefined,
    payloadSize: number,
    logger: ITelemetryLogger,
    requestCallback: (request: number, from: number, to: number, strongTo: boolean) =>
        Promise<{ partial: boolean, cancel: boolean, payload: T[] }>,
): IReadPipe<T[]> {
    const queue = new Queue<T[]>();
    const manager = new ParallelRequests<T>(
        from,
        to,
        payloadSize,
        logger,
        requestCallback,
        (messages: T[]) => queue.pushValue(messages));

    manager.run(concurrency)
        .then(() => queue.pushDone())
        .catch((error) => queue.pushError(error));

    return queue;
}
