/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import {
	isIDeltaManagerFull,
	LoaderHeader,
	type IContainer,
	type ICriticalContainerError,
} from "@fluidframework/container-definitions/internal";
import type { IRequest } from "@fluidframework/core-interfaces";
import { assert } from "@fluidframework/core-utils/internal";
import {
	GenericError,
	isFluidError,
	normalizeError,
} from "@fluidframework/telemetry-utils/internal";

import { loadExistingContainer } from "./createAndLoadContainerUtils.js";
import type { ILoaderProps } from "./loader.js";

/* eslint-disable jsdoc/check-indentation */

/**
 * Loads container and leaves it in a state where it does not process any ops.
 * Container instance returned by this function is in special mode where some functionality that is available in normal use will not work correctly
 * with instance of container returned by this function. Some examples:
 * 1. calling IContainer.connect() will have very little impact on this container as it will not process ops.
 * 2. functionality like waitContainerToCatchUp() or waiting for ops in any other way would hand infinitely, as this container is not processing ops
 * 3. No changes can be made to this container - they will be lost.
 *
 * If sequence number is provided, loads up to this sequence number and stops there, otherwise stops immediately after loading snapshot.
 * In all cases, container is returned disconnected & paused, or an exception is thrown
 * Notes:
 * 1. Ignores LoaderHeader.loadMode headers. Container is always returned with ops applied upt to provided sequence number,
 *    or no ops applied at all (if sequence number is not provided)
 * 2. This call can hang infinitately if disconnected from internet (or hit some other conditions, like 429 storm).
 *    Compare to Container.load() experience (with default settings) - it either returns failure right away, or succeeds, with
 *    ops fetching / delta connection happening in parallel / after container load flow, and thus providing an object (Container instance) to observe
 *    network connectivity issues / ability to cancel (IContainer.disconnect) or close container (IContainer.close)
 *    This flow needs to fetch ops (potentially connecting to delta connection), and any retriable errors on this path result in infinite retry.
 *    If you need to cancel that process, consider supplying AbortSignal parameter.
 * @param loaderProps - The loader props to use to load the container.
 * @param request - request identifying container instance / load parameters. LoaderHeader.loadMode headers are ignored (see above)
 * @param loadToSequenceNumber - optional sequence number. If provided, ops are processed up to this sequence number.
 * @param signal - Optional abort signal. If replay is required and the signal is already aborted,
 * the load rejects without connecting; otherwise, aborting cancels the load while it waits to reach
 * the target sequence number.
 * @returns IContainer instance
 *
 * @internal
 */
export async function loadContainerPaused(
	loaderProps: ILoaderProps,
	request: IRequest,
	loadToSequenceNumber?: number,
	signal?: AbortSignal,
): Promise<IContainer> {
	const container = await loadExistingContainer({
		...loaderProps,
		request: {
			url: request.url,
			headers: {
				...request.headers,
				// ensure we do not process any ops, such that we can examine container before ops starts to flow.
				[LoaderHeader.loadMode]: { opsBeforeReturn: undefined, deltaConnection: "none" },
			},
		},
	});

	// Force readonly mode - this will ensure we don't receive an error for the lack of join op
	let setupContainerUnavailableError: ICriticalContainerError | undefined;
	const captureSetupContainerUnavailableError = (error?: ICriticalContainerError): void => {
		setupContainerUnavailableError = error;
	};
	container.on("closed", captureSetupContainerUnavailableError);
	container.on("disposed", captureSetupContainerUnavailableError);
	try {
		container.forceReadonly?.(true);
	} catch (error) {
		const normalizedError = normalizeError(error);
		container.dispose(normalizedError);
		throw normalizedError;
	} finally {
		container.off("closed", captureSetupContainerUnavailableError);
		container.off("disposed", captureSetupContainerUnavailableError);
	}
	if (container.closed) {
		const error = normalizeError(
			setupContainerUnavailableError ??
				new GenericError(
					"Container closed or disposed without error before the paused load completed.",
				),
		);
		container.dispose(error);
		throw error;
	}

	const dm = container.deltaManager;
	const lastProcessedSequenceNumber = dm.initialSequenceNumber;

	const pauseContainer = (): void => {
		assert(
			isIDeltaManagerFull(dm),
			0xa7f /* Delta manager does not have inbound/outbound queues. */,
		);
		// eslint-disable-next-line no-void
		void dm.inbound.pause();
		// eslint-disable-next-line no-void
		void dm.outbound.pause();
	};

	// Happy path - we are already there.
	if (
		loadToSequenceNumber === undefined ||
		lastProcessedSequenceNumber === loadToSequenceNumber
	) {
		// If we have already reached the desired sequence number, call pauseContainer() to pause immediately.
		pauseContainer();
		return container;
	}

	// If we are trying to pause at a specific sequence number, ensure the latest snapshot is not newer than the desired sequence number.
	if (lastProcessedSequenceNumber > loadToSequenceNumber) {
		const error = new GenericError(
			"Cannot satisfy request to pause the container at the specified sequence number. Most recent snapshot is newer than the specified sequence number.",
			undefined,
			{
				versionMarkAvailabilityOutcome: "targetOlderThanSnapshot",
				versionMarkBaseSnapshotSequenceNumber: lastProcessedSequenceNumber,
			},
		);
		container.dispose(error);
		throw error;
	}

	let opHandler: () => void;
	let onAbort: () => void;
	let onContainerUnavailable: (error?: ICriticalContainerError) => void;
	let replayContainerUnavailableError: ReturnType<typeof normalizeError> | undefined;

	const promise = new Promise<void>((resolve, reject) => {
		onAbort = (): void =>
			reject(
				new GenericError("Canceled due to cancellation request.", undefined, {
					versionMarkAvailabilityOutcome: "cancelled",
				}),
			);
		onContainerUnavailable = (error?: ICriticalContainerError): void => {
			replayContainerUnavailableError = normalizeError(
				error ??
					new GenericError(
						"Container closed or disposed without error while the paused load was waiting for ops.",
					),
			);
			reject(replayContainerUnavailableError);
		};

		// We need to setup a listener to stop op processing once we reach the desired sequence number (if specified).
		opHandler = (): void => {
			// If there is a specified sequence number, keep processing until we reach it.
			if (
				loadToSequenceNumber !== undefined &&
				dm.lastSequenceNumber >= loadToSequenceNumber
			) {
				// Pause op processing once we have processed the desired number of ops.
				pauseContainer();
				resolve();
			}
		};

		// If we have not yet reached the desired sequence number, setup a listener to pause once we reach it.
		signal?.addEventListener("abort", onAbort);
		if (signal?.aborted === true) {
			onAbort();
		}
		container.on("op", opHandler);
		container.on("closed", onContainerUnavailable);
		container.on("disposed", onContainerUnavailable);
	});

	// There are no guarantees on when ops will land in storage.
	// No guarantees that driver implements ops caching (i.e. ops observed in previous session can be served from cache)
	// or that browser will provide caching capabilities / keep the data (localStorage).
	// Thus, we have to ensure we connect to delta storage in order to make forward progress with ops.
	// We also instructed not to fetch / apply any ops from storage above (to be able to install callback above before ops are processed),
	// connect() call will fetch ops as needed.
	if (signal?.aborted !== true) {
		container.connect();
	}

	// Wait for the ops to be processed.
	await promise
		.catch((error: unknown) => {
			const normalizedError = normalizeError(error);
			// The container was loaded from its base snapshot before replay began. Attach that known
			// sequence number to the actual replay/cancellation error so the public point-in-time
			// terminal event can report it without inferring state independently.
			if (isFluidError(normalizedError)) {
				normalizedError.addTelemetryProperties({
					versionMarkBaseSnapshotSequenceNumber: lastProcessedSequenceNumber,
				});
			}
			container.dispose(normalizedError);
			throw normalizedError;
		})
		.finally(() => {
			try {
				// A failure disposes the container in the catch above. Disconnecting it again would
				// throw and replace the original replay or cancellation error.
				if (!container.closed) {
					container.disconnect();
				}
			} finally {
				container.off("op", opHandler);
				container.off("closed", onContainerUnavailable);
				container.off("disposed", onContainerUnavailable);
				signal?.removeEventListener("abort", onAbort);
			}
		});

	// Resolving the replay promise does not stop later listeners in the same synchronous op
	// emission. Recheck the lifecycle state before returning in case one of them closed the container.
	if (container.closed) {
		const error =
			replayContainerUnavailableError ??
			new GenericError(
				"Container closed or disposed without error before the paused load completed.",
			);
		container.dispose(error);
		throw error;
	}

	return container;
}

/* eslint-enable jsdoc/check-indentation */
