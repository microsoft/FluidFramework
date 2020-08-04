/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { ITree, ISequencedDocumentMessage } from "@fluidframework/protocol-definitions";
import { IChannel, IChannelServices } from "@fluidframework/datastore-definitions";
import { IErrorEvent, IEventProvider, IEventThisPlaceHolder } from "@fluidframework/common-definitions";

declare module "@fluidframework/core-interfaces" {
    // eslint-disable-next-line @typescript-eslint/no-empty-interface
    interface IFluidObject extends Readonly<Partial<IProvideSharedObject>> { }
}

export const ISharedObject: keyof IProvideSharedObject = "ISharedObject";

export interface IProvideSharedObject {
    readonly ISharedObject: ISharedObject;
}

export interface ISharedObjectEvents extends IErrorEvent {
    (event: "pre-op" | "op",
        listener: (op: ISequencedDocumentMessage, local: boolean, target: IEventThisPlaceHolder) => void);
}

/**
 * Base interface for shared objects from which other interfaces derive. Implemented by SharedObject
 */
export interface ISharedObject<TEvent extends ISharedObjectEvents = ISharedObjectEvents>
    extends IProvideSharedObject, IChannel, IEventProvider<TEvent> {
    /**
     * Binds the given shared object to its containing component runtime, causing it to attach once
     * the runtime attaches.
     */
    bindToContext(): void;

    /**
     * Returns whether the given shared object is attached to storage.
     * @returns True if the given shared object is attached
     */
    isAttached(): boolean;

    /**
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
