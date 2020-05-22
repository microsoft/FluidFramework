/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { IContainerRuntime } from "@fluidframework/container-runtime-definitions";
import { ISequencedDocumentMessage, MessageType, IQuorum } from "@fluidframework/protocol-definitions";
import { IAttachMessage, IEnvelope } from "@fluidframework/runtime-definitions";
import { IComponentLastEditedTracker, ILastEditDetails } from "./interfaces";

const schedulerId = "_schdeuler";

// Returns if an "Attach" or "Operation" type message is from the scheduler.
function isSchedulerMessage(message: ISequencedDocumentMessage) {
    if (message.type === MessageType.Attach) {
        const attachMessage = message.contents as IAttachMessage;
        if (attachMessage.id === schedulerId) {
            return true;
        }
    } else if (message.type === MessageType.Operation) {
        const envelope = message.contents as IEnvelope;
        if (envelope.address === schedulerId) {
            return true;
        }
    }
    return false;
}

// Default implementation of the shouldDiscardMessageFn function below that tells that all messages other
// than "Attach" and "Operation" type messages should be discarded.
function shouldDiscardMessageDefault(message: ISequencedDocumentMessage) {
    if (message.type === MessageType.Attach || message.type === MessageType.Operation) {
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
 * Helper function to set up a component that provides IComponentLastEditedTracker to track last edited in a Container.
 * The component with id "componentId" must implement an IComponentLastEditedTracker and this setup should be called
 * during container instantiatiion so that it does not miss ops. It does the following:
 * - Requests the component with the given id from the runtime and waits for it to load.
 * - Registers an "op" listener on the runtime. On each message, it calls the shouldDiscardMessageFn to check
 *   if the message should be discarded. It also discards all scheduler message. If a message is not discarded,
 *   it passes the last edited information from the message to the last edited tracker in the component.
 * - The last edited information from the last message received before the component is loaded is stored and passed to
 *   the tracker once the component loads.
 * @param componentId - The id of the component whose last edited tracker is to be set up.
 * @param runtime - The container runtime whose messages are to be tracked.
 * @param shouldDiscardMessageFn - Function that tells if a message should not be considered in computing last edited.
 */
export async function setupLastEditedTrackerForContainer(
    componentId: string,
    runtime: IContainerRuntime,
    shouldDiscardMessageFn: (message: ISequencedDocumentMessage) => boolean = shouldDiscardMessageDefault,
) {
    // eslint-disable-next-line prefer-const
    let lastEditedTracker: IComponentLastEditedTracker;
    // Stores the last edit details until the component has loaded.
    let pendingLastEditDetails: ILastEditDetails | undefined;

    // Register an op listener on the runtime. If the component has loaded, it passes the last edited information to its
    // last edited tracker. If the component hasn't loaded, store the last edited information temporarily.
    runtime.on("op", (message: ISequencedDocumentMessage) => {
        // If this is a scheduler messages or it should be discarded as per shouldDiscardMessageFn, return.
        if (shouldDiscardMessageFn(message) || isSchedulerMessage(message)) {
            return;
        }

        // Get the last edited details from the message. If it doesn't exist, return.
        const lastEditDetails = getLastEditDetailsFromMessage(message, runtime.getQuorum());
        if (lastEditDetails === undefined) {
            return;
        }

        if (lastEditedTracker !== undefined) {
            // Update the last edited tracker if the component has loaded.
            lastEditedTracker.updateLastEditDetails(lastEditDetails);
        } else {
            // If the component hasn't loaded, store the last edited details temporarily.
            pendingLastEditDetails = lastEditDetails;
        }
    });

    const response = await runtime.request({ url: componentId });
    if (response.status !== 200 || response.mimeType !== "fluid/component") {
        throw new Error(`Component with id ${componentId} does not exist.`);
    }

    // Get the last edited tracker from the component.
    const component = response.value;
    lastEditedTracker = component.IComponentLastEditedTracker;
    if (lastEditedTracker === undefined) {
        throw new Error(`Component with id ${componentId} does not have IComponentLastEditedTracker.`);
    }

    // Now that the component has loaded, pass any pending last edit details to its last edited tracker.
    if (pendingLastEditDetails !== undefined) {
        lastEditedTracker.updateLastEditDetails(pendingLastEditDetails);
    }
}
