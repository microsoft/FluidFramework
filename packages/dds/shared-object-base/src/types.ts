/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { IErrorEvent, IEventProvider, IEventThisPlaceHolder } from "@fluidframework/common-definitions";
import { IChannel } from "@fluidframework/datastore-definitions";
import { ISequencedDocumentMessage } from "@fluidframework/protocol-definitions";
import { IGarbageCollectionData } from "@fluidframework/runtime-definitions";

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
     * Returns the GC data for this shared object. It contains a list of GC nodes that contains references to
     * other GC nodes.
     * @param fullGC - true to bypass optimizations and force full generation of GC data.
     */
    getGCData(fullGC?: boolean): IGarbageCollectionData;
}
