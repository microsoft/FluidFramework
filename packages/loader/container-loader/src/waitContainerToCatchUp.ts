/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { IContainer, ICriticalContainerError } from "@fluidframework/container-definitions";
import { assert } from "@fluidframework/core-utils";
import { ISequencedDocumentMessage } from "@fluidframework/protocol-definitions";
import {
	GenericError,
	UsageError,
	connectedEventName,
	wrapError,
} from "@fluidframework/telemetry-utils";
import { ConnectionState } from "./connectionState.js";

/**
 * Waits until container connects to delta storage and gets up-to-date.
 *
 * Useful when resolving URIs and hitting 404, due to container being loaded from (stale) snapshot and not being
 * up to date. Host may chose to wait in such case and retry resolving URI.
 *
 * Warning: Will wait infinitely for connection to establish if there is no connection.
 * May result in deadlock if Container.disconnect() is called and never followed by a call to Container.connect().
 *
 * @returns `true`: container is up to date, it processed all the ops that were know at the time of first connection.
 *
 * `false`: storage does not provide indication of how far the client is. Container processed all the ops known to it,
 * but it maybe still behind.
 *
 * @throws an error beginning with `"Container closed"` if the container is closed before it catches up.
 * @alpha
 */

export async function waitContainerToCatchUp(container: IContainer) {
	// Make sure we stop waiting if container is closed.
	if (container.closed) {
		throw new UsageError("waitContainerToCatchUp: Container closed");
	}

	return new Promise<boolean>((resolve, reject) => {
		const deltaManager = container.deltaManager;

		const closedCallback = (err?: ICriticalContainerError | undefined) => {
			container.off("closed", closedCallback);
			const baseMessage = "Container closed while waiting to catch up";
			reject(
				err !== undefined
					? wrapError(
							err,
							(innerMessage) => new GenericError(`${baseMessage}: ${innerMessage}`),
					  )
					: new GenericError(baseMessage),
			);
		};
		container.on("closed", closedCallback);

		// Depending on config, transition to "connected" state may include the guarantee
		// that all known ops have been processed.  If so, we may introduce additional wait here.
		// Waiting for "connected" state in either case gets us at least to our own Join op
		// which is a reasonable approximation of "caught up"
		const waitForOps = () => {
			assert(
				container.connectionState === ConnectionState.CatchingUp ||
					container.connectionState === ConnectionState.Connected,
				0x0cd /* "Container disconnected while waiting for ops!" */,
			);
			const hasCheckpointSequenceNumber = deltaManager.hasCheckpointSequenceNumber;

			const connectionOpSeqNumber = deltaManager.lastKnownSeqNumber;
			assert(
				deltaManager.lastSequenceNumber <= connectionOpSeqNumber,
				0x266 /* "lastKnownSeqNumber should never be below last processed sequence number" */,
			);
			if (deltaManager.lastSequenceNumber === connectionOpSeqNumber) {
				container.off("closed", closedCallback);
				resolve(hasCheckpointSequenceNumber);
				return;
			}
			const callbackOps = (message: ISequencedDocumentMessage) => {
				if (connectionOpSeqNumber <= message.sequenceNumber) {
					container.off("closed", closedCallback);
					resolve(hasCheckpointSequenceNumber);
					deltaManager.off("op", callbackOps);
				}
			};
			deltaManager.on("op", callbackOps);
		};

		// We can leverage DeltaManager's "connect" event here and test for ConnectionState.Disconnected
		// But that works only if service provides us checkPointSequenceNumber
		// Our internal testing is based on R11S that does not, but almost all tests connect as "write" and
		// use this function to catch up, so leveraging our own join op as a fence/barrier
		if (container.connectionState === ConnectionState.Connected) {
			waitForOps();
			return;
		}

		const callback = () => {
			container.off(connectedEventName, callback);
			waitForOps();
		};
		container.on(connectedEventName, callback);

		if (container.connectionState === ConnectionState.Disconnected) {
			container.connect();
		}
	});
}
