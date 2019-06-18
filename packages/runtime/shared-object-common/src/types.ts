/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { ITree } from "@prague/container-definitions";
import { IChannel } from "@prague/runtime-definitions";

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
     * Removes the specified listenever
     */
    removeListener(event: string | symbol, listener: (...args: any[]) => void): this;

    /**
     * Attaches the given shared object to its containing document
     */
    attach(): this;

    /**
     * Returns whether the given shared object is local
     */
    isLocal(): boolean;

    /**
     * Snapshots the object
     */
    snapshot(): ITree;
}
