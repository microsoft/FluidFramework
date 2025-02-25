/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { performanceNow } from "@fluid-internal/client-utils";
import { ITelemetryBaseProperties } from "@fluidframework/core-interfaces";
import { assert, Deferred } from "@fluidframework/core-utils/internal";
import {
	IDeltasFetchResult,
	IStream,
	IStreamResult,
	ISequencedDocumentMessage,
} from "@fluidframework/driver-definitions/internal";
import {
	ITelemetryLoggerExt,
	PerformanceEvent,
} from "@fluidframework/telemetry-utils/internal";

import {
	canRetryOnError,
	createGenericNetworkError,
	getRetryDelayFromError,
} from "./network.js";
import { logNetworkFailure } from "./networkUtils.js";
// For now, this package is versioned and released in unison with the specific drivers
import { pkgVersion as driverVersion } from "./packageVersion.js";
import { calculateMaxWaitTime } from "./runWithRetry.js";

// We double this value in first try in when we calculate time to wait for in "calculateMaxWaitTime" function.
const MissingFetchDelayInMs = 50;

type WorkingState = "working" | "done" | "canceled";

/**
 * Helper class to organize parallel fetching of data
 * It can be used to concurrently do many requests, while consuming
 * data in the right order. Take a look at UT for examples.
 * @param concurrency - level of concurrency
 * @param from - starting point of fetching data (inclusive)
 * @param to - ending point of fetching data. exclusive, or undefined if unknown
 * @param payloadSize - batch size
 * @param logger - logger to use
 * @param requestCallback - callback to request batches
 * @returns Queue that can be used to retrieve data
 * @internal
 */
export class ParallelRequests<T> {
	private latestRequested: number;
	private nextToDeliver: number;
	private readonly results = new Map<number, T[]>();
	private workingState: WorkingState = "working";
	private requestsInFlight = 0;
	private readonly endEvent = new Deferred<void>();
	private requests = 0;
	private readonly knewTo: boolean;

	private get working() {
		return this.workingState === "working";
	}
	public get canceled() {
		return this.workingState === "canceled";
	}

	constructor(
		from: number,
		private to: number | undefined,
		private readonly payloadSize: number,
		private readonly logger: ITelemetryLoggerExt,
		private readonly requestCallback: (
			request: number,
			from: number,
			to: number,
			strongTo: boolean,
			props: ITelemetryBaseProperties,
		) => Promise<{ partial: boolean; cancel: boolean; payload: T[] }>,
		private readonly responseCallback: (payload: T[]) => void,
	) {
		this.latestRequested = from;
		this.nextToDeliver = from;
		this.knewTo = to !== undefined;
	}

	public cancel() {
		if (this.working) {
			this.workingState = "canceled";
			this.endEvent.resolve();
		}
	}

	public async run(concurrency: number) {
		assert(concurrency > 0, 0x102 /* "invalid level of concurrency" */);
		assert(this.working, 0x103 /* "trying to parallel run while not working" */);

		let c = concurrency;
		while (c > 0) {
			c--;
			this.addRequest();
		}
		this.dispatch(); // will recalculate and trigger this.endEvent if needed
		return this.endEvent.promise;
	}

	private done() {
		// We should satisfy request fully.
		assert(this.to !== undefined, 0x104 /* "undefined end point for parallel fetch" */);
		assert(
			this.nextToDeliver >= this.to,
			0x105 /* "unexpected end point for parallel fetch" */,
		);
		if (this.working) {
			this.workingState = "done";
			this.endEvent.resolve();
		}
	}

	private fail(error) {
		if (this.working) {
			this.workingState = "done";
			this.endEvent.reject(error);
		}
	}

	private dispatch() {
		while (this.working) {
			const value = this.results.get(this.nextToDeliver);
			if (value === undefined) {
				break;
			}
			this.results.delete(this.nextToDeliver);
			assert(
				value.length <= this.payloadSize,
				0x1d9 /* "addRequestCore() should break into smaller chunks" */,
			);
			this.nextToDeliver += value.length;
			this.responseCallback(value);
		}

		// Account for cancellation - state might be not in consistent state on cancelling operation
		if (this.working) {
			if (this.requestsInFlight === 0) {
				// we should have dispatched everything, no matter whether we knew about the end or not.
				// see comment in addRequestCore() around throwing away chunk if it's above this.to
				assert(
					this.results.size === 0,
					0x107 /* "ending dispatch with remaining results to be sent" */,
				);
				this.done();
			} else if (this.to !== undefined && this.nextToDeliver >= this.to) {
				// Learned about the end and dispatched all the ops up to it.
				// Ignore all the in-flight requests above boundary - unblock caller sooner.
				assert(
					!this.knewTo,
					0x108 /* "ending results dispatch but knew in advance about more requests" */,
				);
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

		return { from, to: this.latestRequested };
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
				assert(
					!this.knewTo,
					0x10e /* "should not throw result if we knew about boundary in advance" */,
				);
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
				let fullChunk = requestedLength <= length; // we can possible get more than we asked.

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
					assert(
						!partial,
						0x10f /* "empty/partial chunks should not be returned by caching" */,
					);
					assert(
						!this.knewTo,
						0x110 /* "callback should retry until valid fetch before it learns new boundary" */,
					);
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
					while (payload.length !== 0) {
						const data = payload.splice(0, requestedLength);
						this.results.set(from, data);
						from += data.length;
					}

					this.latestRequested = from;
					fullChunk = true;
				}

				if (fullChunk) {
					const chunk = this.getNextChunk();
					if (chunk === undefined) {
						break;
					}
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
 * @internal
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

const waitForOnline = async (): Promise<void> => {
	// Only wait if we have a strong signal that we're offline - otherwise assume we're online.
	if (globalThis.navigator?.onLine === false && globalThis.addEventListener !== undefined) {
		return new Promise<void>((resolve) => {
			const resolveAndRemoveListener = () => {
				resolve();
				globalThis.removeEventListener("online", resolveAndRemoveListener);
			};
			globalThis.addEventListener("online", resolveAndRemoveListener);
		});
	}
};

/**
 * Retrieve single batch of ops
 * @param request - request index
 * @param from - inclusive boundary
 * @param to - exclusive boundary
 * @param telemetryEvent - telemetry event used to track consecutive batch of requests
 * @param strongTo - tells if ops in range from...to have to be there and have to be retrieved.
 * If false, returning less ops would mean we reached end of file.
 * @param logger - logger object to use to log progress & errors
 * @param signal - cancelation signal
 * @param scenarioName - reason for fetching ops
 * @returns An object with resulting ops and cancellation / partial result flags
 */
async function getSingleOpBatch(
	get: (telemetryProps: ITelemetryBaseProperties) => Promise<IDeltasFetchResult>,
	props: ITelemetryBaseProperties,
	strongTo: boolean,
	logger: ITelemetryLoggerExt,
	signal?: AbortSignal,
	scenarioName?: string,
): Promise<{ partial: boolean; cancel: boolean; payload: ISequencedDocumentMessage[] }> {
	let lastSuccessTime: number | undefined;
	let totalRetryAfterTime = 0;
	let telemetryEvent: PerformanceEvent | undefined;
	let retry: number = 0;
	const nothing = { partial: false, cancel: true, payload: [] };
	let waitStartTime: number = 0;
	let waitTime = MissingFetchDelayInMs;

	while (signal?.aborted !== true) {
		retry++;
		let lastError: unknown;
		const startTime = performanceNow();

		try {
			// Issue async request for deltas
			const { messages, partialResult } = await get({ ...props, retry } /* telemetry props */);

			// If we got messages back, return them.  Return regardless of whether we got messages back if we didn't
			// specify a "to", since we don't have an expectation of how many to receive.
			if (messages.length !== 0 || !strongTo) {
				// Report this event if we waited to fetch ops due to being offline or throttling.
				telemetryEvent?.end({
					duration: totalRetryAfterTime,
					...props,
					reason: scenarioName,
				});
				return { payload: messages, cancel: false, partial: partialResult };
			}

			// Otherwise, the storage gave us back an empty set of ops but we were expecting a non-empty set.

			if (lastSuccessTime === undefined) {
				// Take timestamp of the first time server responded successfully, even though it wasn't with the ops we asked for.
				// If we keep getting empty responses we'll eventually fail out below.
				lastSuccessTime = performanceNow();
			} else if (performanceNow() - lastSuccessTime > 30000) {
				// If we are connected and receiving proper responses from server, but can't get any ops back,
				// then give up after some time. This likely indicates the issue with ordering service not flushing
				// ops to storage quick enough, and possibly waiting for summaries, while summarizer can't get
				// current as it can't get ops.
				throw createGenericNetworkError(
					// pre-0.58 error message: failedToRetrieveOpsFromStorage:TooManyRetries
					"Failed to retrieve ops from storage (Too Many Retries)",
					{ canRetry: false },
					{
						retry,
						driverVersion,
						...props,
					},
				);
			}
		} catch (error) {
			lastError = error;
			const canRetry = canRetryOnError(error);

			const retryAfter = getRetryDelayFromError(error);

			// This will log to error table only if the error is non-retryable
			logNetworkFailure(
				logger,
				{
					eventName: "GetDeltas_Error",
					...props,
					retry,
					duration: performanceNow() - startTime,
					retryAfter,
					reason: scenarioName,
				},
				error,
			);

			if (!canRetry) {
				// It's game over scenario.
				throw error;
			}
		}

		if (telemetryEvent === undefined) {
			waitStartTime = performanceNow();
			telemetryEvent = PerformanceEvent.start(logger, {
				eventName: "GetDeltasWaitTime",
			});
		}

		waitTime = calculateMaxWaitTime(waitTime, lastError);

		// If we get here something has gone wrong - either got an unexpected empty set of messages back or a real error.
		// Either way we will wait a little bit before retrying.
		await new Promise<void>((resolve) => {
			setTimeout(resolve, waitTime);
		});

		// If we believe we're offline, we assume there's no point in trying until we at least think we're online.
		// NOTE: This isn't strictly true for drivers that don't require network (e.g. local driver).  Really this logic
		// should probably live in the driver.
		await waitForOnline();
		totalRetryAfterTime += performanceNow() - waitStartTime;
	}

	return nothing;
}

/**
 * Request ops from storage
 * @param get - Getter callback to get individual batches
 * @param concurrency - Number of concurrent requests to make
 * @param fromTotal - starting sequence number to fetch (inclusive)
 * @param toTotal - max (exclusive) sequence number to fetch
 * @param payloadSize - Payload size
 * @param logger - Logger to log progress and errors
 * @param signal - Cancelation signal
 * @param scenarioName - Reason for fetching ops
 * @returns Messages fetched
 * @internal
 */
export function requestOps(
	get: (
		from: number,
		to: number,
		telemetryProps: ITelemetryBaseProperties,
	) => Promise<IDeltasFetchResult>,
	concurrency: number,
	fromTotal: number,
	toTotal: number | undefined,
	payloadSize: number,
	logger: ITelemetryLoggerExt,
	signal?: AbortSignal,
	scenarioName?: string,
): IStream<ISequencedDocumentMessage[]> {
	let requests = 0;
	let lastFetch: number | undefined;
	let length = 0;
	const queue = new Queue<ISequencedDocumentMessage[]>();

	const propsTotal: ITelemetryBaseProperties = {
		fromTotal,
		toTotal,
	};

	const telemetryEvent = PerformanceEvent.start(logger, {
		eventName: "GetDeltas",
		...propsTotal,
		reason: scenarioName,
	});

	const manager = new ParallelRequests<ISequencedDocumentMessage>(
		fromTotal,
		toTotal,
		payloadSize,
		logger,
		async (
			request: number,
			from: number,
			to: number,
			strongTo: boolean,
			propsPerRequest: ITelemetryBaseProperties,
		) => {
			requests++;
			return getSingleOpBatch(
				async (propsAll) => get(from, to, propsAll),
				{ request, from, to, ...propsTotal, ...propsPerRequest },
				strongTo,
				logger,
				signal,
				scenarioName,
			);
		},
		(deltas: ISequencedDocumentMessage[]) => {
			// Assert continuing and right start.
			if (lastFetch === undefined) {
				assert(deltas[0].sequenceNumber === fromTotal, 0x26d /* "wrong start" */);
			} else {
				assert(deltas[0].sequenceNumber === lastFetch + 1, 0x26e /* "wrong start" */);
			}
			lastFetch = deltas[deltas.length - 1].sequenceNumber;
			assert(
				lastFetch - deltas[0].sequenceNumber + 1 === deltas.length,
				0x26f /* "continuous and no duplicates" */,
			);
			length += deltas.length;
			queue.pushValue(deltas);
		},
	);

	// Implement faster cancellation. getSingleOpBatch() checks signal, but only in between
	// waits (up to 10 seconds) and fetches (can take infinite amount of time).
	// While every such case should be improved and take into account signal (and thus cancel immediately),
	// it is beneficial to have catch-all
	const listener = (event: Event) => {
		manager.cancel();
	};
	if (signal !== undefined) {
		signal.addEventListener("abort", listener);
	}

	manager
		.run(concurrency)
		.finally(() => {
			if (signal !== undefined) {
				signal.removeEventListener("abort", listener);
			}
		})
		.then(() => {
			const props = {
				lastFetch,
				length,
				requests,
			};
			if (manager.canceled) {
				telemetryEvent.cancel({ ...props, error: "ops request cancelled by client" });
			} else {
				assert(
					toTotal === undefined || (lastFetch !== undefined && lastFetch >= toTotal - 1),
					0x270 /* "All requested ops fetched" */,
				);
				telemetryEvent.end(props);
			}
			queue.pushDone();
		})
		.catch((error) => {
			telemetryEvent.cancel(
				{
					lastFetch,
					length,
					requests,
				},
				error,
			);
			queue.pushError(error);
		});

	return queue;
}

/**
 * @internal
 */
export const emptyMessageStream: IStream<ISequencedDocumentMessage[]> = {
	read: async () => {
		return { done: true };
	},
};

/**
 * @internal
 */
export function streamFromMessages(
	messagesArg: Promise<ISequencedDocumentMessage[]>,
): IStream<ISequencedDocumentMessage[]> {
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

/**
 * @internal
 */
export function streamObserver<T>(
	stream: IStream<T>,
	handler: (value: IStreamResult<T>) => void,
): IStream<T> {
	return {
		read: async () => {
			const value = await stream.read();
			handler(value);
			return value;
		},
	};
}
