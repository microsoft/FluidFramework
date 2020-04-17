/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { ISequencedDocumentMessage, MessageType } from "@microsoft/fluid-protocol-definitions";
import { IAttachMessage, IEnvelope, IHostRuntime } from "@microsoft/fluid-runtime-definitions";
import { IComponentLastEditedTracker } from "./interfaces";

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

/**
 * Helper function to set up a root component that provides IComponentLastEditedTracker to track last edited in a.
 * Container. The component with id "rootrootComponentId" must implement an IComponentLastEditedTracker and this setup
 * should be called during container instantiatiion so that it does not miss ops. It does the following:
 * - Requests the component with the given id from the runtime and waits for it to load.
 * - Registers an "op" listener on the runtime. On each message, it calls the shouldDiscardMessageFn to check
 *   if the message should be discarded. It also discards all scheduler message. If a message is not discarded,
 *   it is passed to the last edited tracker in the component.
 * - The last message received before the component is loaded is stored and passed to the tracker once the component
 *   loads.
 * @param rootComponentId - The id of the root component whose last edited tracker is to be set up.
 * @param runtime - The container runtime whose messages are to be tracked.
 * @param shouldDiscardMessageFn - Function that tells if a message should not be considered in computing last edited.
 */
export async function setupLastEditedTrackerForContainer(
    rootComponentId: string,
    runtime: IHostRuntime,
    shouldDiscardMessageFn: (message: ISequencedDocumentMessage) => boolean = shouldDiscardMessageDefault,
) {
    // eslint-disable-next-line prefer-const
    let lastEditedTracker: IComponentLastEditedTracker;
    // Stores messages until the component has loaded.
    let pendingMessage: ISequencedDocumentMessage | undefined;

    // Register an op listener on the runtime. If the component has loaded, it passes the message to its last
    // edited tracker. If the component hasn't loaded, store the message temporarily.
    runtime.on("op", (message: ISequencedDocumentMessage) => {
        // Discard scheduler messages and other messages as per shouldDiscardMessageFn.
        if (!shouldDiscardMessageFn(message) && !isSchedulerMessage(message)) {
            if (lastEditedTracker !== undefined) {
                lastEditedTracker.updateLastEditDetails(message);
            } else {
                pendingMessage = message;
            }
        }
    });

    const response = await runtime.request({ url: rootComponentId });
    if (response.status !== 200 || response.mimeType !== "fluid/component") {
        throw new Error(`Component with id ${rootComponentId} does not exist.`);
    }

    // Get the last edited tracker from the component.
    const component = response.value;
    lastEditedTracker = component.IComponentLastEditedTracker;
    if (lastEditedTracker === undefined) {
        throw new Error(`Component with id ${rootComponentId} does not have IComponentLastEditedTracker.`);
    }

    // Now that the component has loaded, pass any pending message to its last edited tracker.
    if (pendingMessage !== undefined) {
        lastEditedTracker.updateLastEditDetails(pendingMessage);
    }
}
