/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { ISequencedDocumentMessage, IQuorum } from "@fluidframework/protocol-definitions";
import { ContainerMessageType } from "@fluidframework/container-runtime";
import { IContainerRuntime } from "@fluidframework/container-runtime-definitions";
import { ILastEditDetails, IFluidLastEditedTracker } from "./interfaces";

// Default implementation of the shouldDiscardMessageFn function below that tells that all messages other
// than "Attach" and "Operation" type messages should be discarded.
function shouldDiscardMessageDefault(message: ISequencedDocumentMessage) {
    if (message.type === ContainerMessageType.Attach || message.type === ContainerMessageType.FluidDataStoreOp) {
        return false;
    }
    return true;
}

// Extracts the user information and timestamp from a message. Returns undefined if the user information for the
// client who sent the message doesn't exist in the quorum.
function getLastEditDetailsFromMessage(
    message: ISequencedDocumentMessage,
    quorum: IQuorum,
): ILastEditDetails | undefined {
    const sequencedClient = quorum.getMember(message.clientId);
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
 * It does the following:
 * - Registers an "op" listener on the runtime. On each message, it calls the shouldDiscardMessageFn to check
 *   if the message should be discarded. It also discards all scheduler message. If a message is not discarded,
 *   it passes the last edited information from the message to the last edited tracker.
 * - The last edited information from the last message received before the lastEditedTracker is
 *   loaded is stored and passed tothe tracker once it loads.
 * @param lastEditedTracker - The last editied tracker.
 * @param runtime - The container runtime whose messages are to be tracked.
 * @param shouldDiscardMessageFn - Function that tells if a message should not be considered in computing last edited.
 */
export function setupLastEditedTrackerForContainer(
    lastEditedTracker: IFluidLastEditedTracker,
    runtime: IContainerRuntime,
    shouldDiscardMessageFn: (message: ISequencedDocumentMessage) => boolean = shouldDiscardMessageDefault,
) {
    // Register an op listener on the runtime. If the lastEditedTracker has loaded,
    // it passes the last edited information to its
    // last edited tracker. If the lastEditedTracker hasn't loaded, store the last edited information temporarily.
    runtime.on("op", (message: ISequencedDocumentMessage) => {
        // If this message should be discarded as per shouldDiscardMessageFn, return.
        if (shouldDiscardMessageFn(message)) {
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
