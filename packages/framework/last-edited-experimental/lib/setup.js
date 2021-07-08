/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */
import { ContainerMessageType } from "@fluidframework/container-runtime";
// Default implementation of the shouldDiscardMessageFn function below that tells that all messages other
// than "Attach" and "Operation" type messages should be discarded.
function shouldDiscardMessageDefault(message) {
    if (message.type === ContainerMessageType.Attach || message.type === ContainerMessageType.FluidDataStoreOp) {
        return false;
    }
    return true;
}
// Extracts the user information and timestamp from a message. Returns undefined if the user information for the
// client who sent the message doesn't exist in the quorum.
function getLastEditDetailsFromMessage(message, quorum) {
    const sequencedClient = quorum.getMember(message.clientId);
    const user = sequencedClient === null || sequencedClient === void 0 ? void 0 : sequencedClient.client.user;
    if (user !== undefined) {
        const lastEditDetails = {
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
export function setupLastEditedTrackerForContainer(lastEditedTracker, runtime, shouldDiscardMessageFn = shouldDiscardMessageDefault) {
    // Register an op listener on the runtime. If the lastEditedTracker has loaded,
    // it passes the last edited information to its
    // last edited tracker. If the lastEditedTracker hasn't loaded, store the last edited information temporarily.
    runtime.on("op", (message) => {
        // If this is a scheduler messages or it should be discarded as per shouldDiscardMessageFn, return.
        // To check for this, we use the runtime's isMessageDirtyable API. If it is not available, we assume
        // that the message should not be discarded.
        const isDirtyable = runtime.IContainerRuntimeDirtyable === undefined
            ? true : runtime.IContainerRuntimeDirtyable.isMessageDirtyable(message);
        if (shouldDiscardMessageFn(message) || !isDirtyable) {
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
//# sourceMappingURL=setup.js.map