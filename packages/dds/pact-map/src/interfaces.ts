/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import type {
	ISharedObject,
	ISharedObjectEvents,
} from "@fluidframework/shared-object-base/internal";

/**
 * Events emitted by {@link IPactMap}.
 * @internal
 */
export interface IPactMapEvents extends ISharedObjectEvents {
	/**
	 * Notifies when a new value goes pending or has been accepted.
	 */
	(event: "pending" | "accepted", listener: (key: string) => void);
}

/**
 * Details of the accepted pact.
 * @internal
 */
export interface IAcceptedPact<T> {
	/**
	 * The accepted value of the given type or undefined (typically in case of delete).
	 */
	value: T | undefined;

	/**
	 * The sequence number when the value was accepted.
	 *
	 * For values set in detached state, it will be 0.
	 */
	acceptedSequenceNumber: number;
}

/**
 * An IPactMap is a key-value storage, in which setting a value is done via a proposal system.  All collaborators
 * who were connected at the time of the proposal must accept the change before it is considered accepted (or, if
 * those clients disconnect they are considered to have implicitly accepted).  As a result, the value goes through
 * two phases:
 * 1. "pending" state where the proposal has been sequenced, but there are still outstanding acceptances
 * 2. "accepted" state where all clients who were connected at the time the proposal was made have either accepted
 * or disconnected.
 * @internal
 */
export interface IPactMap<T = unknown> extends ISharedObject<IPactMapEvents> {
	/**
	 * Gets the accepted value for the given key.
	 * @param key - The key to retrieve from
	 */
	get(key: string): T | undefined;

	/**
	 * Gets the accepted value and details for the given key.
	 * @param key - The key to retrieve from
	 */
	getWithDetails(key: string): IAcceptedPact<T> | undefined;

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
	 * clients have approved the change.  The accepted value remains unchanged until that time.
	 * @param key - The key to set
	 * @param value - The value to store
	 */
	set(key: string, value: T | undefined): void;

	/**
	 * Deletes the key/value pair at the given key.  After issuing the delete, the delete is in "pending" state until
	 * all connected clients have approved the delete.  The accepted value remains unchanged until that time.
	 * @param key - the key to delete
	 */
	delete(key: string): void;
}
