/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { ISharedObject, ISharedObjectEvents } from "@fluidframework/shared-object-base";

/**
 * IQuorumEvents are the events fired by an IQuorum.
 */
export interface IQuorumEvents extends ISharedObjectEvents {
    /**
     * Notifies when a new value goes pending or has been accepted.
     */
    (event: "pending" | "accepted", listener: (key: string) => void);
}

/**
 * An IQuorum is a key-value storage, in which setting a value requires all connected collaborators to observe and ack
 * the set message.  As a result, the value goes through two phases - "pending" state where the local client has seen
 * the set, but not all connected clients have, and "accepted" where all connected clients have seen the set.
 */
export interface IQuorum<T = unknown> extends ISharedObject<IQuorumEvents> {
    /**
     * Gets the accepted value for the given key.
     * @param key - The key to retrieve from
     */
    get(key: string): T | undefined;

    /**
     * Returns whether there is a pending value for the given key.  Can be used to distinguish a pending delete vs.
     * nothing pending when getPending would just return undefined.
     * @param key - The key to check
     */
    isPending(key: string): boolean;

    /**
     * Gets the pending value for the given key.
     * @param key - The key to retrieve from
     */
    getPending(key: string): T | undefined;

    /**
     * Sets the value for the given key.  After setting the value, it will be in "pending" state until all connected
     * clients have ack'd the set.  The accepted value remains unchanged until that time.
     * @param key - The key to set
     * @param value - The value to store
     */
    set(key: string, value: T | undefined): void;

    /**
     * Deletes the key/value pair at the given key.  After issuing the delete, the delete is in "pending" state until
     * all connected clients have ack'd the delete.  The accepted value remains unchanged until that time.
     * @param key - the key to delete
     */
    delete(key: string): void;
}
