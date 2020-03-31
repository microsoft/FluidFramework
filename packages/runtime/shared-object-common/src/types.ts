/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { ITree } from "@microsoft/fluid-protocol-definitions";
import { IChannel, ISharedObjectServices } from "@microsoft/fluid-runtime-definitions";

declare module "@microsoft/fluid-container-definitions" {
    // eslint-disable-next-line @typescript-eslint/no-empty-interface
    interface IComponent extends Readonly<Partial<IProvideSharedObject>> { }
}

export const ISharedObject: keyof IProvideSharedObject = "ISharedObject";

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
