/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { ISharedObject, ISharedObjectEvents } from "@fluidframework/shared-object-base";

export interface IQuorumEvents extends ISharedObjectEvents {
    /**
     * Notifies when the local client has reached or left the front of the queue.  Does not account for known pending
     * ops, but instead only reflects the current state.
     */
    (event: "assigned" | "lost", listener: (taskId: string) => void);
}

/**
 * Task manager interface
 */

export interface IQuorum extends ISharedObject<IQuorumEvents> {
    has(key: string): boolean;
    get(key: string): any;
    set(key: string, value: any): Promise<void>;
}
