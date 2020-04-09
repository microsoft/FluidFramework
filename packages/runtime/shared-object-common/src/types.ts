/* eslint-disable max-len */
/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { ITree, ISequencedDocumentMessage } from "@microsoft/fluid-protocol-definitions";
import { IChannel, ISharedObjectServices } from "@microsoft/fluid-runtime-definitions";
import { IErrorEvent, IEventThisPlaceHolder, IEventProvider } from "./events";

declare module "@microsoft/fluid-container-definitions" {
    // eslint-disable-next-line @typescript-eslint/no-empty-interface
    interface IComponent extends Readonly<Partial<IProvideSharedObject>> { }
}

export const ISharedObject: keyof IProvideSharedObject = "ISharedObject";

export interface IProvideSharedObject {
    readonly ISharedObject: ISharedObject;
}

export interface ISharedObjectEvents extends IErrorEvent  {
    (event: "pre-op" | "op", listener: (op: ISequencedDocumentMessage, local: boolean, target: IEventThisPlaceHolder) => void);
    (event: "disconnected" | "connected" | "processed", listener: (target: IEventThisPlaceHolder) => void);
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
     * Returns whether the given shared object is local.
     * @returns True if the given shared object is local
     */
    isLocal(): boolean;

    /**
     * Returns whether the given shared object is registered.
     * @returns True if the given shared object is registered
     */
    isRegistered(): boolean;

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
