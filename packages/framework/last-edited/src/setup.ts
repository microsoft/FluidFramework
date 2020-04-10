/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { ISequencedDocumentMessage } from "@microsoft/fluid-protocol-definitions";
import { IHostRuntime } from "@microsoft/fluid-runtime-definitions";
import { ILastEditedTracker } from "./interfaces";

/**
 * Helper function to set up last edited tracker in the component with the given id. The component must implement
 * IComponentLastEditedTracker and this setup should be done during instantiatiion so that it does not miss ops.
 * It does the following:
 * - Requests the component with the given id from the runtime and waits for it to load.
 * - Registers an "op" listener on the runtime. On each message, it calls the shouldDiscardMessageFn to check
 *   if the message should be discarded. If not, it passes the message to the last edited tracker in the component.
 * - Any messages received before the component is loaded are stored in a buffer and passed to the tracker once the
 *   component loads.
 * @param componentId: The id of the root component whose last edited tracker is to be set up.
 * @param runtime - The container runtime whose messages are to be tracked.
 * @param shouldDiscardMessageFn - Function that tells if a message should not be considered in computing last edited.
 */
export async function setupLastEditedTracker(
    componentId: string,
    runtime: IHostRuntime,
    shouldDiscardMessageFn: (message: ISequencedDocumentMessage) => boolean,
) {
    // eslint-disable-next-line prefer-const
    let lastEditedTracker: ILastEditedTracker;
    // Stores messages until the component has loaded.
    const pendingMessageBuffer: ISequencedDocumentMessage[] = [];

    // Register an op listener on the runtime. If the component has loaded, it passes the message to its last
    // edited tracker. If the component hasn't loaded, it stores the messages in a temporary buffer.
    runtime.on("op", (message: ISequencedDocumentMessage) => {
        // Filter out messages that should be discarded.
        if (!shouldDiscardMessageFn(message)) {
            if (lastEditedTracker !== undefined) {
                lastEditedTracker.updateLastEditDetails(message);
            } else {
                pendingMessageBuffer.push(message);
            }
        }
    });

    const response = await runtime.request({ url: componentId });
    if (response.status !== 200 || response.mimeType !== "fluid/component") {
        throw new Error(`Component with id ${componentId} does not exist.`);
    }

    // Get the last edited tracker from the component.
    const component = response.value;
    lastEditedTracker = component.IComponentLastEditedTracker.lastEditedTracker;
    if (lastEditedTracker === undefined) {
        throw new Error(`Component with id ${componentId} does not have ILastEditedTracker.`);
    }

    // Now that the component has loaded, pass any pending messages to its last edited tracker.
    pendingMessageBuffer.forEach((message: ISequencedDocumentMessage) => {
        lastEditedTracker.updateLastEditDetails(message);
    });
}
