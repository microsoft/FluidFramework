/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { ILoader, LoaderHeader } from "@fluidframework/container-definitions/internal";
import { IRequest } from "@fluidframework/core-interfaces";
import { ISequencedDocumentMessage } from "@fluidframework/protocol-definitions";

/**
 * Loads container and leaves it in a state where it does not process any ops
 * If sequence number is provided, loads up to this sequence number and stops there, otherwise stops immediately after loading snapshot.
 * @internal
 * */
export async function loadContainerPaused(
	loader: ILoader,
	request: IRequest,
	loadToSequenceNumber?: number,
) {
	const container = await loader.resolve({
		url: request.url,
		headers: {
			...request.headers,
			// ensure we do not process any ops.
			[LoaderHeader.loadMode]: { opsBeforeReturn: undefined, deltaConnection: "none" },
		},
	});

	// If we are trying to pause at a specific sequence number, ensure the latest snapshot is not newer than the desired sequence number.
	if (loadToSequenceNumber !== undefined) {
		const lastProcessedSequenceNumber = container.deltaManager.initialSequenceNumber;
		if (lastProcessedSequenceNumber > loadToSequenceNumber) {
			throw new Error(
				"Cannot satisfy request to pause the container at the specified sequence number. Most recent snapshot is newer than the specified sequence number.",
			);
		}
	}

	// Force readonly mode - this will ensure we don't receive an error for the lack of join op
	container.forceReadonly?.(true);

	// We need to setup a listener to stop op processing once we reach the desired sequence number (if specified).
	const opHandler = () => {
		if (loadToSequenceNumber === undefined) {
			// If there is no specified sequence number, pause after the inbound queue is empty.
			if (container.deltaManager.inbound.length !== 0) {
				return;
			}
		} else {
			// If there is a specified sequence number, keep processing until we reach it.
			if (container.deltaManager.lastSequenceNumber < loadToSequenceNumber) {
				return;
			}
		}

		// Pause op processing once we have processed the desired number of ops.
		void container.deltaManager.inbound.pause();
		void container.deltaManager.outbound.pause();
		container.off("op", opHandler);
	};
	if (
		(loadToSequenceNumber === undefined && container.deltaManager.inbound.length === 0) ||
		container.deltaManager.lastSequenceNumber === loadToSequenceNumber
	) {
		// If we have already reached the desired sequence number, call opHandler() to pause immediately.
		opHandler();
	} else {
		// If we have not yet reached the desired sequence number, setup a listener to pause once we reach it.
		container.on("op", opHandler);
	}

	// There are no guarantees on when ops will land in storage.
	// No guarantees that driver implements ops caching (i.e. ops observed in previous session can be served from cache)
	// or that browser will provide caching capabilities / keep the data (localStorage).
	// So we have to ensure we connect to delta storage in order to make forward progress with ops.
	// We also instructed not to fetch / apply any ops from storage above (to be able to install callback above before ops are processed),
	// connect() call will fetch ops as needed.
	container.connect();

	// If we have not yet reached `loadToSequenceNumber`, we will wait for ops to arrive until we reach it
	if (
		loadToSequenceNumber !== undefined &&
		container.deltaManager.lastSequenceNumber < loadToSequenceNumber
	) {
		await new Promise<void>((resolve, reject) => {
			const opHandler2 = (message: ISequencedDocumentMessage) => {
				if (message.sequenceNumber >= loadToSequenceNumber) {
					resolve();
					container.off("op", opHandler2);
				}
			};
			container.on("op", opHandler2);
		});
	}

	return container;
}
