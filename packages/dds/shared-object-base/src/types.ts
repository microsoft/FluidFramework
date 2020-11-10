/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { IErrorEvent, IEventProvider, IEventThisPlaceHolder } from "@fluidframework/common-definitions";
import { IChannel, IChannelServices } from "@fluidframework/datastore-definitions";
import { ISequencedDocumentMessage, ITree } from "@fluidframework/protocol-definitions";
import { IChannelSummarizeResult } from "@fluidframework/runtime-definitions";

export interface ISharedObjectEvents extends IErrorEvent {
    (event: "pre-op" | "op",
        listener: (op: ISequencedDocumentMessage, local: boolean, target: IEventThisPlaceHolder) => void);
}

/**
 * Base interface for shared objects from which other interfaces derive. Implemented by SharedObject
 */
export interface ISharedObject<TEvent extends ISharedObjectEvents = ISharedObjectEvents>
    extends IChannel, IEventProvider<TEvent> {
    /**
     * Binds the given shared object to its containing data store runtime, causing it to attach once
     * the runtime attaches.
     */
    bindToContext(): void;

    /**
     * Returns whether the given shared object is attached to storage.
     * @returns True if the given shared object is attached
     */
    isAttached(): boolean;

    /**
     * Generates summary of the shared object.
     * @returns A tree representing the summary of the shared object and a set of nodes for garbage collection.
     */
    summarize(fullTree?: boolean): IChannelSummarizeResult;

    /**
     * @deprecated - Use summarize to get serialized object data.
     * Gets a form of the object that can be serialized.
     * @returns A tree representing the snapshot of the shared object
     */
    snapshot(): ITree;

    /**
     * Enables the channel to send and receive ops.
     * @param services - Services to connect to
     */
    connect(services: IChannelServices): void;
}
