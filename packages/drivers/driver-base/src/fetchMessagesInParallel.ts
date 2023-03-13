/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { IEvent } from "@fluidframework/common-definitions";
import { assert, TypedEventEmitter } from "@fluidframework/common-utils";
import { IDeltasFetchResult } from "@fluidframework/driver-definitions";
import { ISequencedDocumentMessage } from "@fluidframework/protocol-definitions";

const MaxFetchDelayInMs = 10000;
const MissingFetchDelayInMs = 100;

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

interface IRequestStateEmitterEvents extends IEvent {
	(event: "received", listener: () => void);
	(event: "requestError", listener: () => void);
}

/**
 * Rather than directly requesting a set of messages from the provided getMessages() callback, this function
 * orchestrates splitting the request into batches for parallel requests.  The results are provided via async iterator.
 * The iterator throws upon yield if an unrecoverable error is encountered during the requesting.
 * @param getMessages - A callback to fetch the specified range of messages in [from, to)
 * @param from - The inclusive start index to fetch
 * @param to - Either the exclusive end index to fetch, or undefined to fetch all available messages after from
 * @param maxConcurrentRequests - Maximum number of parallel requests to permit
 * @param messagesPerRequest - Maximum number of messages to request in a single batch
 * @param abortSignal - Optional abort signal to immediately terminate requests.  The iterator will be done on next yield.
 * @returns - An async iterator providing the requested messages, which will throw on error or be done early on abort.
 */
export const fetchMessagesInParallel = async function* (
	getMessages: (from: number, to: number) => Promise<IDeltasFetchResult>,
	from: number,
	to: number | undefined,
	maxConcurrentRequests: number,
	messagesPerRequest: number,
	abortSignal?: AbortSignal,
) {
	// The next index that no requestor has claimed
	let nextUnrequestedIndex = from;
	// The index after which we don't need any more messages.  If explicitly specified (with "to") we'll use that,
	// otherwise we'll learn it by seeing a non-partial result come back with fewer messages than we requested.
	let finalMessageIndex = to;

	// Receiving and delivering messages should run async from one another.  This emitter lets the delivery know that
	// new data from receiving has become available -- either new messages have been received, or an error has occured.
	const requestStateEmitter = new TypedEventEmitter<IRequestStateEmitterEvents>();
	// If any requestor has hit an error, we'll store it here.  Once we error, we cancel all requests and the next
	// yield will throw the error.
	let requestorError: Error | undefined;

	// As we receive the arrays of messages, we'll store them by starting sequence number.  Note that we may receive
	// them out of order, and in varying size chunks (depending on if we get partial responses).
	const messages: Map<number, ISequencedDocumentMessage[]> = new Map();
	// To deliver the message arrays that are stored in the map, we need to understand the next expected key to
	// deliver from.  We can do this by adding the length of each array as we deliver it.
	let nextToDeliver = from;

	// The two things that can cause "surprise" exits are errors and aborting.
	const shouldKeepRunning = () => requestorError === undefined && abortSignal?.aborted !== true;

	// Augment the provided getMessages with retry (and cancel) logic.  Return the result if successful.  Return
	// undefined if giving up (due to abort, other requestor error, or realize we're requesting beyond the end of
	// available messages).
	const getMessagesWithRetry = async (
		_from: number,
		_to: number,
	): Promise<IDeltasFetchResult | undefined> => {
		let retryCount: number = 0;
		let getResult: IDeltasFetchResult | undefined;

		// Keep trying until we get the messages we requested, or learn that we are requesting beyond the end of the
		// available messages (in the undefined "to" case).  The latter is possible if another requestor was already
		// getting the last batch when we started this attempt.
		// Also stop trying if any requestors have hit an error or if the caller aborted the request.
		while (
			shouldKeepRunning() &&
			getResult === undefined &&
			(finalMessageIndex === undefined || _from < finalMessageIndex)
		) {
			try {
				// Issue async request for deltas
				getResult = await getMessages(_from, _to);
			} catch (error) {
				// Check if error or abort happened while getting messages.  Return undefined if we should give up.
				if (!shouldKeepRunning()) {
					return;
				}

				const canRetry: boolean = (error as any)?.canRetry === true;
				if (!canRetry) {
					throw error;
				}

				retryCount++;
				const retryAfterSeconds: number | undefined = (error as any)?.retryAfterSeconds;
				const delayMs =
					retryAfterSeconds !== undefined
						? retryAfterSeconds * 1000
						: Math.min(
								MaxFetchDelayInMs,
								MissingFetchDelayInMs * Math.pow(2, retryCount),
						  );

				// Probably should be:
				// 1. Wait the amount the error says if it says
				// 2. Only wait for online if confident offline
				// 3. Wait for scaling duration if uncertain why failure
				await new Promise<void>((resolve) => {
					setTimeout(resolve, delayMs);
				});

				// Check if error or abort happened during the retry wait.  Return undefined if we should give up.
				if (!shouldKeepRunning()) {
					return;
				}

				// If we believe we're offline, we assume there's no point in trying until we at least think we're online.
				// NOTE: This isn't strictly true for drivers that don't require network (e.g. local driver).  Really this logic
				// should probably live in the driver.
				await waitForOnline();
			}
		}

		// Only return the result if it is still needed.
		if (shouldKeepRunning()) {
			return getResult;
		}
	};

	// Spawn a new requestor that will run until the overall request has completed.
	const runRequestor = async () => {
		// Keep taking new batches to request while there are (or might be) remaining messages to request, and we
		// haven't been errored or aborted.
		while (
			(finalMessageIndex === undefined || nextUnrequestedIndex < finalMessageIndex) &&
			shouldKeepRunning()
		) {
			// Claim the next batch of messages to request
			let requestStartIndex = nextUnrequestedIndex;
			const requestEndIndex =
				to !== undefined
					? Math.min(requestStartIndex + messagesPerRequest, to)
					: requestStartIndex + messagesPerRequest;
			nextUnrequestedIndex = requestEndIndex;

			let batchComplete = false;
			// Keep trying to get the rest of the batch as long as we don't have the whole batch, and we also think
			// our batch might be a part of the overall request, and we haven't been errored or aborted.
			while (
				!batchComplete &&
				(finalMessageIndex === undefined || requestStartIndex < finalMessageIndex) &&
				shouldKeepRunning()
			) {
				// If the request throws, we'll catch it outside of runRequestor.
				const result = await getMessagesWithRetry(requestStartIndex, requestEndIndex);
				// getMessagesWithRetry will only return undefined if it gave up on the request. This means either:
				// 1. We've already received all the messages (and we're done)
				// 2. Some other requestor hit an error (and we're broken)
				// 3. The request was aborted (and we're done)
				// In any case we can shut down the requestor without further action.
				if (result === undefined) {
					return;
				}

				// Store the messages we recieved
				messages.set(requestStartIndex, result.messages);

				// If we only got part of what we requested, set up to issue another request for the remainder.
				if (result.partialResult) {
					requestStartIndex = requestStartIndex + result.messages.length;
				} else {
					batchComplete = true;
					// If we didn't know how many to expect and the service says we got everything but it's less than
					// we requested, we assume it means there are no more available messages
					if (
						finalMessageIndex === undefined &&
						requestStartIndex + result.messages.length < requestEndIndex
					) {
						finalMessageIndex = requestEndIndex + result.messages.length;
					}
				}

				// Emit after calculating whether we're done, so the delivery loop can exit if we are.
				requestStateEmitter.emit("received");
			}
		}
	};

	// Set up requesting
	for (let i = 0; i < maxConcurrentRequests; i++) {
		runRequestor().catch((error: Error) => {
			// If we hit any error, we want to make it the very next thing we raise to the caller.
			requestorError ??= error;
			// Emitting the requestError event will break delivery out of waiting for messages.
			requestStateEmitter.emit("requestError");
		});
	}

	// Set up delivery
	while (finalMessageIndex === undefined || nextToDeliver < finalMessageIndex) {
		// If we don't have anything to deliver readily available...
		if (shouldKeepRunning() && messages.get(nextToDeliver) === undefined) {
			// Wait until we receive the next item to yield or an error to throw.
			await new Promise<void>((resolve) => {
				const checkForRequiredMessages = () => {
					if (messages.get(nextToDeliver) !== undefined) {
						removeListeners();
						resolve();
					}
				};
				const waitForError = () => {
					removeListeners();
					resolve();
				};
				const waitForAbort = () => {
					removeListeners();
					resolve();
				};
				const removeListeners = () => {
					requestStateEmitter.off("received", checkForRequiredMessages);
					requestStateEmitter.off("requestError", waitForError);
					abortSignal?.removeEventListener("abort", waitForAbort);
				};
				requestStateEmitter.on("received", checkForRequiredMessages);
				requestStateEmitter.on("requestError", waitForError);
				abortSignal?.addEventListener("abort", waitForAbort);
			});
		}

		// Just return early if aborted.
		if (abortSignal?.aborted) {
			return;
		}

		// Throw the error if we have one.  The next time the caller awaits the next yield it will throw the error.
		if (requestorError !== undefined) {
			throw requestorError;
		}

		// Otherwise yield the next set of messages and repeat.
		const nextDelivery = messages.get(nextToDeliver);
		assert(
			nextDelivery !== undefined,
			"Delivery failed to wait for messages to become available",
		);
		nextToDeliver += nextDelivery.length;
		yield nextDelivery;
	}
};
