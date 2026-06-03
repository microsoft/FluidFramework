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
			 * Another client already claimed this key, or a CAS operation failed
			 * because a concurrent write was detected (the key's sequence number
			 * advanced since this client last observed it).
			 */
			readonly status: "AlreadyClaimed";

			/**
			 * The current committed value for the key, or `undefined` if the key
			 * has not been claimed.
			 */
			readonly currentValue: T | undefined;
	  }
	| {
			/**
			 * The operation was aborted (e.g., due to rollback or disposal).
			 */
			readonly status: "Aborted";
	  };

/**
 * The result of a {@link IClaims.trySetClaim} or {@link IClaims.compareAndSetClaim} operation.
 *
 * @internal
 */
export type ClaimResult<T = unknown> =
	| {
			/**
			 * The claim was accepted synchronously (e.g., in detached mode where no
			 * other clients exist and the value can be applied immediately).
			 */
			readonly status: "Accepted";

			/**
			 * The accepted value.
			 */
			readonly currentValue: T;
	  }
	| {
			/**
			 * Another client already claimed this key, or a CAS operation failed
			 * because the local expected value did not match, indicating a
			 * concurrent write has occurred.
			 */
			readonly status: "AlreadyClaimed";

			/**
			 * The current committed value for the key, or `undefined` if the key
			 * has not been claimed.
			 */
			readonly currentValue: T | undefined;
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
export interface IClaimsEvents extends ISharedObjectEvents {
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
 * Claims acts as a scoped aliasing mechanism. {@link IClaims.trySetClaim} provides
 * write-once semantics — once a key is claimed, it cannot be overwritten.
 * {@link IClaims.compareAndSetClaim} provides compare-and-swap semantics —
 * the caller supplies an expected value for a local pre-check, while the
 * underlying conflict resolution uses per-key sequence numbers to determine
 * whether a concurrent write has occurred.
 *
 * @internal
 */
export interface IClaims<T = unknown> extends ISharedObject<IClaimsEvents> {
	/**
	 * Attempts to claim a key with the given value using first-writer-wins semantics.
	 * Only succeeds if the key has not already been claimed.
	 *
	 * @param key - The claim key to reserve.
	 * @param value - The value to associate with the claim.
	 * @returns The claim result — synchronous for known states, or "Pending" with a promise.
	 * @throws Will throw a {@link @fluidframework/telemetry-utils#UsageError} if a claim
	 * for this key is already pending locally.
	 */
	trySetClaim(key: string, value: T): ClaimResult<T>;

	/**
	 * Attempts to update an existing claim using compare-and-swap (CAS) semantics.
	 * Only succeeds if the current value for the key matches `expectedValue`.
	 *
	 * @experimental
	 * @param key - The claim key to update.
	 * @param value - The new value to set.
	 * @param expectedValue - The expected current value. The update is only submitted
	 * if the committed value matches this exactly. Pass `undefined` to set only if
	 * the key is unset.
	 * @returns The claim result — synchronous for known states, or "Pending" with a promise.
	 * @throws Will throw a {@link @fluidframework/telemetry-utils#UsageError} if a claim
	 * for this key is already pending locally.
	 */
	compareAndSetClaim(key: string, value: T, expectedValue: T | undefined): ClaimResult<T>;

	/**
	 * Gets the current claimed value for a key, or `undefined` if the key has not been claimed.
	 *
	 * @param key - The claim key to look up.
	 * @returns The claimed value, or `undefined` if unclaimed.
	 */
	getClaim(key: string): T | undefined;

	/**
	 * Returns whether a claim exists for the given key.
	 *
	 * @remarks
	 * This distinguishes "key was never set" from "key was set to `undefined`".
	 *
	 * @param key - The claim key to check.
	 * @returns `true` if the key has been claimed, `false` otherwise.
	 */
	has(key: string): boolean;
}
