/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import type {
	ISharedObject,
	ISharedObjectEvents,
} from "@fluidframework/shared-object-base/internal";

/**
 * The confirmed result of a pending claim, resolved after the op roundtrips.
 *
 * @internal
 */
export type ClaimConfirmation<T = unknown> =
	| {
			/**
			 * The claim was successfully reserved by this client.
			 */
			readonly status: "Accepted";

			/**
			 * The value that was claimed.
			 */
			readonly currentValue: T;
	  }
	| {
			/**
			 * Another client already claimed this key.
			 */
			readonly status: "AlreadyClaimed";

			/**
			 * The value that was previously claimed by the winning client.
			 */
			readonly currentValue: T;
	  }
	| {
			/**
			 * The operation was aborted (e.g., due to rollback or disposal).
			 */
			readonly status: "Aborted";
	  };

/**
 * The result of a {@link IClaims.trySetClaim} operation.
 *
 * @internal
 */
export type ClaimResult<T = unknown> =
	| {
			/**
			 * The claim was accepted synchronously (e.g., in detached or staging mode).
			 */
			readonly status: "Accepted";

			/**
			 * The accepted value.
			 */
			readonly currentValue: T;
	  }
	| {
			/**
			 * Another client already claimed this key.
			 */
			readonly status: "AlreadyClaimed";

			/**
			 * The value that was previously claimed by the winning client.
			 */
			readonly currentValue: T;
	  }
	| {
			/**
			 * The claim op has been submitted and is awaiting server acknowledgement.
			 */
			readonly status: "Pending";

			/**
			 * A promise that resolves with the final outcome once the op roundtrips.
			 */
			readonly promise: Promise<ClaimConfirmation<T>>;
	  };

/**
 * Events emitted by {@link IClaims}.
 *
 * @internal
 */
export interface IClaimsEvents<T = unknown> extends ISharedObjectEvents {
	/**
	 * Notifies when a claim has been accepted for a key.
	 * Use {@link IClaims.getClaim} to retrieve the committed value.
	 */
	(event: "claimed", listener: (key: string) => void): void;
}

/**
 * A distributed data structure providing first-writer-wins claim semantics
 * with optional compare-and-swap (CAS) support.
 *
 * @remarks
 * Claims acts as a scoped aliasing mechanism. The `trySetClaim` method provides
 * write-once semantics by default — once a key is claimed, it cannot be overwritten.
 * By passing an `expectedValue`, `trySetClaim` becomes a compare-and-swap operation
 * that only updates the key if the current value matches the expected value.
 *
 * @internal
 */
export interface IClaims<T = unknown> extends ISharedObject<IClaimsEvents<T>> {
	/**
	 * Attempts to claim a key with the given value using first-writer-wins semantics,
	 * or updates an existing key using compare-and-swap (CAS) semantics.
	 *
	 * @remarks
	 * When `expectedValue` is omitted, this performs a write-once claim — only succeeds
	 * if the key does not already exist. When `expectedValue` is provided, this performs
	 * a compare-and-swap — only succeeds if the current value matches `expectedValue`.
	 *
	 * @param key - The claim key to reserve or update.
	 * @param value - The value to associate with the claim.
	 * @param expectedValue - If provided, the current value must match this for the
	 * operation to succeed (CAS semantics). If omitted, the key must not exist (write-once).
	 * @returns The claim result — synchronous for known states, or "Pending" with a promise.
	 * @throws Will throw a {@link @fluidframework/telemetry-utils#UsageError} if the
	 * container is not attached and connected.
	 */
	trySetClaim(key: string, value: T, expectedValue?: T): ClaimResult<T>;

	/**
	 * Gets the current claimed value for a key, or `undefined` if the key has not been claimed.
	 *
	 * @param key - The claim key to look up.
	 * @returns The claimed value, or `undefined` if unclaimed.
	 */
	getClaim(key: string): T | undefined;
}
