/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */
import { assert, Deferred } from "@fluidframework/common-utils";
import { ITelemetryLogger, ITelemetryProperties } from "@fluidframework/common-definitions";
import { PerformanceEvent} from "@fluidframework/telemetry-utils";
import { ISequencedDocumentMessage } from "@fluidframework/protocol-definitions";
import { IDeltasFetchResult, IStream, IStreamResult } from "@fluidframework/driver-definitions";
import { getRetryDelayFromError, canRetryOnError, createGenericNetworkError } from "./network";
import { waitForConnectedState } from "./networkUtils";

const MaxFetchDelaySeconds = 10;
const MissingFetchDelaySeconds = 0.1;

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
        private readonly requestCallback: (
            request: number,
            from: number,
            to: number,
            strongTo: boolean,
            props: ITelemetryProperties) => Promise<{ partial: boolean, cancel: boolean, payload: T[] }>,
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
        assert(concurrency > 0, 0x102 /* "invalid level of concurrency" */);
        assert(this.working, 0x103 /* "trying to parallel run while not working" */);

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
        assert(this.to !== undefined, 0x104 /* "undefined end point for parallel fetch" */);
        assert(this.nextToDeliver >= this.to, 0x105 /* "unexpected end point for parallel fetch" */);
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
            assert(value.length <= this.payloadSize, 0x1d9 /* "addRequestCore() should break into smaller chunks" */);
            this.nextToDeliver += value.length;
            this.responseCallback(value);
        }

        // Account for cancellation - state might be not in consistent state on cancelling operation
        if (this.working) {
            if (this.requestsInFlight === 0) {
                // we should have dispatched everything, no matter whether we knew about the end or not.
                // see comment in addRequestCore() around throwing away chunk if it's above this.to
                assert(this.results.size === 0,
                    0x107 /* "ending dispatch with remaining results to be sent" */);
                this.done();
            } else if (this.to !== undefined && this.nextToDeliver >= this.to) {
                // Learned about the end and dispatched all the ops up to it.
                // Ignore all the in-flight requests above boundary - unblock caller sooner.
                assert(!this.knewTo, 0x108 /* "ending results dispatch but knew in advance about more requests" */);
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

        assert(from < this.latestRequested, 0x109 /* "unexpected next chunk position" */);

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
        assert(this.working, 0x10a /* "cannot add parallel request while not working" */);

        let from = fromArg;
        let to = toArg;

        // to & from are exclusive
        this.requestsInFlight++;
        while (this.working) {
            const requestedLength = to - from;
            assert(requestedLength > 0, 0x10b /* "invalid parallel request range" */);

            // We should not be wasting time asking for something useless.
            if (this.to !== undefined) {
                assert(from < this.to, 0x10c /* "invalid parallel request start point" */);
                assert(to <= this.to, 0x10d /* "invalid parallel request end point" */);
            }

            this.requests++;

            const promise = this.requestCallback(this.requests, from, to, this.to !== undefined, {});

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
                assert(!this.knewTo, 0x10e /* "should not throw result if we knew about boundary in advance" */);
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
                const fromOrig = from;
                const length = payload.length;
                let fullChunk = (requestedLength <= length); // we can possible get more than we asked.

                if (length !== 0) {
                    // We can get more than we asked for!
                    // This can screw up logic in dispatch!
                    // So push only batch size, and keep the rest for later - if conditions are favorable, we
                    // will be able to use it. If not (parallel request overlapping these ops), it's easier to
                    // discard them and wait for another (overlapping) request to come in later.
                    if (requestedLength < length) {
                        // This is error in a sense that it's not expected and likely points bug in other layer.
                        // This layer copes with this situation just fine.
                        this.logger.sendTelemetryEvent({
                            eventName: "ParallelRequests_Over",
                            from,
                            to,
                            length,
                        });
                    }
                    const data = payload.splice(0, requestedLength);
                    this.results.set(from, data);
                    from += data.length;
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
                    assert(!partial, 0x10f /* "empty/partial chunks should not be returned by caching" */);
                    assert(!this.knewTo,
                        0x110 /* "callback should retry until valid fetch before it learns new boundary" */);
                }

                if (!partial && !fullChunk) {
                    if (!this.knewTo) {
                        if (this.to === undefined || this.to > from) {
                            // The END
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
                    this.logger.sendPerformanceEvent({
                        eventName: "ParallelRequests_Partial",
                        from: fromOrig,
                        to,
                        length,
                    });
                }

                if (to === this.latestRequested) {
                    // we can go after full chunk at the end if we received partial chunk, or more than asked
                    // Also if we got more than we asked to, we can actually use those ops!
                    if (payload.length !== 0) {
                        this.results.set(from, payload);
                        from += payload.length;
                    }

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
 * Helper queue class to allow async push / pull
 * It's essentially a pipe allowing multiple writers, and single reader
 */
export class Queue<T> implements IStream<T> {
    private readonly queue: Promise<IStreamResult<T>>[] = [];
    private deferred: Deferred<IStreamResult<T>> | undefined;
    private done = false;

    public pushValue(value: T) {
        this.pushCore(Promise.resolve({ done: false, value }));
    }

    public pushError(error: any) {
        this.pushCore(Promise.reject(error));
        this.done = true;
    }

    public pushDone() {
        this.pushCore(Promise.resolve({ done: true }));
        this.done = true;
    }

    protected pushCore(value: Promise<IStreamResult<T>>) {
        assert(!this.done, 0x112 /* "cannot push onto queue if done" */);
        if (this.deferred) {
            assert(this.queue.length === 0, 0x113 /* "deferred queue should be empty" */);
            this.deferred.resolve(value);
            this.deferred = undefined;
        } else {
            this.queue.push(value);
        }
    }

    public async read(): Promise<IStreamResult<T>> {
        assert(this.deferred === undefined, 0x114 /* "cannot pop if deferred" */);
        const value = this.queue.shift();
        if (value !== undefined) {
            return value;
        }
        assert(!this.done, 0x115 /* "queue should not be done during pop" */);
        this.deferred = new Deferred<IStreamResult<T>>();
        return this.deferred.promise;
    }
}

/**
 * Retrieve single batch of ops
 * @param request - request index
 * @param from - inclusive boundary
 * @param to - exclusive boundary
 * @param telemetryEvent - telemetry event used to track consecutive batch of requests
 * @param strongTo - tells if ops in range from...to have to be there and have to be retrieved.
 * If false, returning less ops would mean we reached end of file.
 * @returns - an object with resulting ops and cancellation / partial result flags
 */
async function getSingleOpBatch(
    get: (telemetryProps: ITelemetryProperties) => Promise<IDeltasFetchResult>,
    props: ITelemetryProperties,
    strongTo: boolean,
    signal?: AbortSignal):
        Promise<{ partial: boolean, cancel: boolean, payload: ISequencedDocumentMessage[] }>
{
    let lastSuccessTime: number | undefined;

    let retry: number = 0;
    const deltas: ISequencedDocumentMessage[] = [];
    const nothing = { partial: false, cancel: true, payload: []};

    while (signal?.aborted !== true) {
        retry++;
        let delay = Math.min(MaxFetchDelaySeconds, MissingFetchDelaySeconds * Math.pow(2, retry));
        let canRetry = false;

        try {
            // Issue async request for deltas - limit the number fetched to MaxBatchDeltas
            canRetry = true;
            const deltasP = get({ ...props, retry } /* telemetry props */);

            const { messages, partialResult } = await deltasP;
            deltas.push(...messages);

            const deltasRetrievedLast = messages.length;

            if (deltasRetrievedLast !== 0 || !strongTo) {
                return { payload: deltas, cancel: false, partial: partialResult};
            }

            // Storage does not have ops we need.
            // Attempt to fetch more deltas. If we didn't receive any in the previous call we up our retry
            // count since something prevented us from seeing those deltas

            if (lastSuccessTime === undefined) {
                lastSuccessTime = Date.now();
            } else if (Date.now() - lastSuccessTime > 30000) {
                // If we are connected and receiving proper responses from server, but can't get any ops back,
                // then give up after some time. This likely indicates the issue with ordering service not flushing
                // ops to storage quick enough, and possibly waiting for summaries, while summarizer can't get
                // current as it can't get ops.
                throw createGenericNetworkError(
                    "Failed to retrieve ops from storage: too many retries",
                    false /* canRetry */,
                    undefined /* retryAfterSeconds */,
                    {
                        retry,
                        ...props,
                    },
                );
            }
        } catch (error) {
            canRetry = canRetry && canRetryOnError(error);

            lastSuccessTime = undefined;

            /*
            logNetworkFailure(
                this.logger,
                {
                    eventName: "GetDeltas_Error",
                    ...props,
                    retry,
                },
                error);
                */

            if (!canRetry) {
                // It's game over scenario.
                throw error;
            }
            const retryAfter = getRetryDelayFromError(error);

            if (retryAfter !== undefined && retryAfter >= 0) {
                delay = retryAfter;
            }
        }

        await waitForConnectedState(delay * 1000);
    }

    return nothing;
}

export function requestOps(
    get: (from: number, to: number, telemetryProps: ITelemetryProperties) => Promise<IDeltasFetchResult>,
    concurrency: number,
    fromTotal: number,
    toTotal: number | undefined,
    payloadSize: number,
    logger: ITelemetryLogger,
    signal?: AbortSignal,
): IStream<ISequencedDocumentMessage[]> {
    let requests = 0;
    let lastFetch: number | undefined;
    let deltasRetrievedTotal = 0;
    const queue = new Queue<ISequencedDocumentMessage[]>();

    const propsTotal: ITelemetryProperties = {
        fromTotal,
        toTotal,
    };

    const telemetryEvent = PerformanceEvent.start(logger, {
        eventName: `GetDeltas`,
        ...propsTotal,
    });

    const manager = new ParallelRequests<ISequencedDocumentMessage>(
        fromTotal,
        toTotal,
        payloadSize,
        logger,
        async (request: number, from: number, to: number, strongTo: boolean, propsPerRequest: ITelemetryProperties) => {
            requests++;
            return getSingleOpBatch(
                async (propsAll) => get(from, to, propsAll),
                { request, from, to, ...propsTotal, ...propsPerRequest },
                strongTo,
                signal,
            );
        },
        (deltas: ISequencedDocumentMessage[]) => {
            lastFetch = deltas[deltas.length - 1].sequenceNumber;
            deltasRetrievedTotal += deltas.length;
            queue.pushValue(deltas);
        });

    manager.run(concurrency)
        .then(() => {
            telemetryEvent.end({
                lastFetch,
                deltasRetrievedTotal,
                requests,
            });
            queue.pushDone();
        })
        .catch((error) => {
            telemetryEvent.cancel({
                lastFetch,
                deltasRetrievedTotal,
                requests,
            }, error);
            queue.pushError(error);
        });

    return queue;
}

export const emptyMessageStream: IStream<ISequencedDocumentMessage[]> = {
    read: async () => { return { done: true };},
};

export function streamFromMessages(messagesArg: Promise<ISequencedDocumentMessage[]>):
    IStream<ISequencedDocumentMessage[]>
{
    let messages: Promise<ISequencedDocumentMessage[]> | undefined = messagesArg;
    return {
        read: async () => {
            if (messages === undefined) {
                return { done: true };
            }
            const value = await messages;
            messages = undefined;
            return value.length === 0 ? { done: true } : { done: false, value };
        },
    };
}

// eslint-disable-next-line prefer-arrow/prefer-arrow-functions
export function streamObserver<T>(stream: IStream<T>, handler: (value: IStreamResult<T>) => void): IStream<T> {
    return {
        read: async () => {
            const value = await stream.read();
            handler(value);
            return value;
        },
    };
}
