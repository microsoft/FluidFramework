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
 * The result of a {@link ISharedClaims.trySetClaim} operation.
 *
 * @internal
 */
export type ClaimResult<T = unknown> =
	| {
			/**
			 * The key was already committed by a previous claim.
			 */
			readonly status: "Accepted";

			/**
			 * The committed value.
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
 * Events emitted by {@link ISharedClaims}.
 *
 * @internal
 */
export interface ISharedClaimsEvents<T = unknown> extends ISharedObjectEvents {
	/**
	 * Notifies when a claim has been accepted for a key.
	 */
	(event: "claimed", listener: (key: string, value: T) => void): void;
}

/**
 * A distributed data structure providing first-writer-wins claim semantics.
 *
 * @remarks
 * SharedClaims acts as a scoped aliasing mechanism. Once a key is claimed, it cannot be
 * overwritten. The `trySetClaim` method returns a synchronous result indicating whether
 * the key is already claimed, or a pending status with a promise that resolves after the
 * op roundtrips.
 *
 * @internal
 */
export interface ISharedClaims<T = unknown> extends ISharedObject<ISharedClaimsEvents<T>> {
	/**
	 * Attempts to claim a key with the given value. If the key is already claimed,
	 * the existing value is returned synchronously. Otherwise, the claim op is submitted
	 * and a "Pending" result is returned with a promise for the final outcome.
	 *
	 * @param key - The claim key to reserve.
	 * @param value - The value to associate with the claim.
	 * @returns The claim result — synchronous for known states, or "Pending" with a promise.
	 * @throws Will throw a {@link @fluidframework/telemetry-utils#UsageError} if the
	 * container is not attached and connected.
	 */
	trySetClaim(key: string, value: T): ClaimResult<T>;

	/**
	 * Gets the current claimed value for a key, or `undefined` if the key has not been claimed.
	 *
	 * @param key - The claim key to look up.
	 * @returns The claimed value, or `undefined` if unclaimed.
	 */
	getClaim(key: string): T | undefined;
}
