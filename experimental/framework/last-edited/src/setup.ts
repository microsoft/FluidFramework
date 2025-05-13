/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { ContainerMessageType } from "@fluidframework/container-runtime/internal";
import { IContainerRuntime } from "@fluidframework/container-runtime-definitions/internal";
import { IQuorumClients } from "@fluidframework/driver-definitions";
import { ISequencedDocumentMessage } from "@fluidframework/driver-definitions/internal";

import { IFluidLastEditedTracker, ILastEditDetails } from "./interfaces.js";

/**
 * Default implementation of {@link setupLastEditedTrackerForContainer}'s `shouldDiscardMessageFn` parameter,
 * which tells that all messages other than {@link @fluidframework/container-runtime#ContainerMessageType.Alias},
 * {@link @fluidframework/container-runtime#ContainerMessageType.Attach}, and
 * {@link @fluidframework/container-runtime#ContainerMessageType.FluidDataStoreOp} type messages should be
 * discarded.
 */
const shouldDiscardMessageDefault = (message: ISequencedDocumentMessage): boolean =>
	message.type !== ContainerMessageType.Attach &&
	message.type !== ContainerMessageType.FluidDataStoreOp &&
	message.type !== ContainerMessageType.Alias;

/**
 * Extracts the user information and timestamp from a message. Returns undefined if the user information for the
 * client who sent the message doesn't exist in the quorum.
 */
function getLastEditDetailsFromMessage(
	message: ISequencedDocumentMessage,
	quorum: IQuorumClients,
): ILastEditDetails | undefined {
	// TODO: Verify whether this should be able to handle server-generated ops (with null clientId)
	// eslint-disable-next-line @typescript-eslint/no-unnecessary-type-assertion
	const sequencedClient = quorum.getMember(message.clientId as string);
	const user = sequencedClient?.client.user;
	if (user !== undefined) {
		const lastEditDetails: ILastEditDetails = {
			user,
			timestamp: message.timestamp,
		};
		return lastEditDetails;
	}
	return undefined;
}

/**
 * Helper function to set up a data object that provides IFluidLastEditedTracker to track last edited in a Container.
 *
 * It does the following:
 *
 * - Registers an "op" listener on the runtime. On each message, it calls the shouldDiscardMessageFn to check
 * if the message should be discarded. It also discards all scheduler message. If a message is not discarded,
 * it passes the last edited information from the message to the last edited tracker.
 *
 * - The last edited information from the last message received before the lastEditedTracker is
 * loaded is stored and passed to the tracker once it loads.
 * @param lastEditedTracker - The last edited tracker.
 * @param runtime - The container runtime whose messages are to be tracked.
 * @param shouldDiscardMessageFn - Function that tells if a message should not be considered in computing last edited.
 * @internal
 */
export function setupLastEditedTrackerForContainer(
	lastEditedTracker: IFluidLastEditedTracker,
	runtime: IContainerRuntime,
	shouldDiscardMessageFn: (
		message: ISequencedDocumentMessage,
	) => boolean = shouldDiscardMessageDefault,
): void {
	// Register an op listener on the runtime. If the lastEditedTracker has loaded,
	// it passes the last edited information to its
	// last edited tracker. If the lastEditedTracker hasn't loaded, store the last edited information temporarily.
	runtime.on("op", (message: ISequencedDocumentMessage, runtimeMessage?: boolean) => {
		// If this message should be discarded as per shouldDiscardMessageFn, return.
		if (runtimeMessage === false || shouldDiscardMessageFn(message)) {
			return;
		}

		// Get the last edited details from the message. If it doesn't exist, return.
		const lastEditDetails = getLastEditDetailsFromMessage(message, runtime.getQuorum());
		if (lastEditDetails === undefined) {
			return;
		}

		lastEditedTracker.updateLastEditDetails(lastEditDetails);
	});
}
