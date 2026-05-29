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
			 * because the current value did not match the expected value.
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
			 * The claim was accepted synchronously (e.g., in detached or staging mode).
			 *
			 * @remarks
			 * This status is reserved for future use. Currently, `trySetClaim` and
			 * `compareAndSetClaim` require an attached, connected container and will
			 * always return `"Pending"` on success. This variant will be used when
			 * detached or staging mode support is added.
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
			 * because the current value did not match the expected value.
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
 * the key is only updated if the current value matches the expected value.
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
	 * @throws Will throw a {@link @fluidframework/telemetry-utils#UsageError} if the
	 * container is not attached and connected, or if a claim for this key is already
	 * pending locally.
	 */
	trySetClaim(key: string, value: T): ClaimResult<T>;

	/**
	 * Attempts to update an existing claim using compare-and-swap (CAS) semantics.
	 * Only succeeds if the current value for the key matches `expectedValue`.
	 *
	 * @remarks
	 * CAS comparison uses strict equality (`===`). This means CAS is only reliable for
	 * primitive values (strings, numbers, booleans). For object or handle values, CAS
	 * will compare by reference, which is unlikely to match across distributed clients.
	 *
	 * @param key - The claim key to update.
	 * @param value - The new value to set.
	 * @param expectedValue - The expected current value. The update only succeeds if the
	 * committed value matches this exactly.
	 * @returns The claim result — synchronous for known states, or "Pending" with a promise.
	 * @throws Will throw a {@link @fluidframework/telemetry-utils#UsageError} if the
	 * container is not attached and connected, or if a claim for this key is already
	 * pending locally.
	 */
	compareAndSetClaim(key: string, value: T, expectedValue: T): ClaimResult<T>;

	/**
	 * Gets the current claimed value for a key, or `undefined` if the key has not been claimed.
	 *
	 * @param key - The claim key to look up.
	 * @returns The claimed value, or `undefined` if unclaimed.
	 */
	getClaim(key: string): T | undefined;
}
