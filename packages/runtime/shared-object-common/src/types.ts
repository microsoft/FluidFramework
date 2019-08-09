/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { ITree } from "@prague/protocol-definitions";
import { IChannel, ISharedObjectServices } from "@prague/runtime-definitions";

declare module "@prague/container-definitions" {
    interface IComponent {
        readonly ISharedObject?: ISharedObject;
    }
}

/**
 * Base interface for shared objects from which other interfaces derive. Implemented by SharedObject
 */
export interface ISharedObject extends IChannel {
    /**
     * The type of the shared object
     */
    type: string;

    /**
     * Marker to clearly identify the object as a shared object
     */
    __sharedObject__: boolean;

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
