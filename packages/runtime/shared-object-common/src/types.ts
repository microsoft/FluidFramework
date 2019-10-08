/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { ITree } from "@microsoft/fluid-protocol-definitions";
import { IChannel, ISharedObjectServices } from "@microsoft/fluid-runtime-definitions";

declare module "@microsoft/fluid-container-definitions" {
    interface IComponent extends Readonly<Partial<IProvideSharedObject>> { }
}

export interface IProvideSharedObject {
    readonly ISharedObject: ISharedObject;
}

/**
 * Base interface for shared objects from which other interfaces derive. Implemented by SharedObject
 */
export interface ISharedObject extends IProvideSharedObject, IChannel {
    /**
     * Attaches an event listener for the given event
     */
    on(event: string | symbol, listener: (...args: any[]) => void): this;

    /**
     * Removes the specified listener
     */
    removeListener(event: string | symbol, listener: (...args: any[]) => void): this;

    /**
     * Registers the given shared object to its containing runtime
     */
    register(): void;

    /**
     * Returns whether the given shared object is local
     */
    isLocal(): boolean;

    /**
     * True if the channel has been registered.
     */
    isRegistered(): boolean;

    /**
     * Snapshots the object
     */
    snapshot(): ITree;

    /**
     * Enables the channel to send and receive ops
     */
    connect(services: ISharedObjectServices): void;
}
