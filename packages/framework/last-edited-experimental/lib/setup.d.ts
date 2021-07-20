/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */
import { ISequencedDocumentMessage } from "@fluidframework/protocol-definitions";
import { IContainerRuntime } from "@fluidframework/container-runtime-definitions";
import { IFluidLastEditedTracker } from "./interfaces";
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
export declare function setupLastEditedTrackerForContainer(lastEditedTracker: IFluidLastEditedTracker, runtime: IContainerRuntime, shouldDiscardMessageFn?: (message: ISequencedDocumentMessage) => boolean): void;
//# sourceMappingURL=setup.d.ts.map