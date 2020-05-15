/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { ITree, ISequencedDocumentMessage } from "@microsoft/fluid-protocol-definitions";
import { IChannel, ISharedObjectServices } from "@microsoft/fluid-component-runtime-definitions";
import { IErrorEvent, IEventProvider, IEventThisPlaceHolder } from "@microsoft/fluid-common-definitions";

declare module "@microsoft/fluid-container-definitions" {
    // eslint-disable-next-line @typescript-eslint/no-empty-interface
    interface IComponent extends Readonly<Partial<IProvideSharedObject>> { }
}

export const ISharedObject: keyof IProvideSharedObject = "ISharedObject";

export interface IProvideSharedObject {
    readonly ISharedObject: ISharedObject;
}

export interface ISharedObjectEvents extends IErrorEvent  {
    (event: "pre-op" | "op",
        listener: (op: ISequencedDocumentMessage, local: boolean, target: IEventThisPlaceHolder) => void);
    (event: "disconnected" | "connected" | "processed", listener: () => void);
}

/**
 * Base interface for shared objects from which other interfaces derive. Implemented by SharedObject
 */
export interface ISharedObject<TEvent extends ISharedObjectEvents = ISharedObjectEvents>
    extends IProvideSharedObject, IChannel, IEventProvider<TEvent> {
    /**
     * Registers the given shared object to its containing component runtime, causing it to attach once
     * the runtime attaches.
     */
    register(): void;

    /**
     * Returns whether the given shared object is local. It is local if either it is not attached or
     * container is not attached to storage.
     * @returns True if the given shared object is local
     *
     */
    isLocal(): boolean;

    /**
     * Returns whether the given shared object is registered.
     * @returns True if the given shared object is registered
     */
    isRegistered(): boolean;

    /**
     * Returns whether the given shared object is attached to parent component. Parent component
     * should also be attached. It does not matter if the container is live or local.
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
    connect(services: ISharedObjectServices): void;
}
