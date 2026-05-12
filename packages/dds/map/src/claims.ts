/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

/**
 * Result of a {@link IClaimable.trySetClaim} call.
 *
 * @remarks
 * - `"Success"` indicates that this client's claim is the sequenced winner for the key.
 * - `"AlreadyClaimed"` indicates that some other claim for the key was sequenced first;
 * the key is now immutable for the lifetime of the document.
 *
 * @legacy @beta
 */
export type ClaimResult = "Success" | "AlreadyClaimed";

/**
 * First-writer-wins ("claim") API for keyed singleton entries on a DDS.
 *
 * @remarks
 * Once a key has been successfully claimed by any client, subsequent attempts to claim the
 * same key from any client will resolve to {@link ClaimResult | `"AlreadyClaimed"`}. Writes
 * to the same key via the DDS's normal mutation APIs (e.g. `set`/`delete`/`clear`) are
 * dropped or rejected, so the claimed value is immutable for the lifetime of the document.
 *
 * This API is opt-in. Implementations gate access behind a runtime option (e.g.
 * `runtime.options.enableDdsClaims`); when disabled, {@link IClaimable.trySetClaim} throws
 * a `UsageError`.
 *
 * @legacy @beta
 */
export interface IClaimable<V = unknown> {
	/**
	 * Attempt to publish `value` for `key` as a singleton.
	 *
	 * @returns A promise that resolves once the claim has been ack'd by the service:
	 * `"Success"` if this client won the race; `"AlreadyClaimed"` if some other claim was
	 * sequenced first.
	 */
	trySetClaim(key: string, value: V): Promise<ClaimResult>;

	/**
	 * @returns `true` if `key` has been sequenced as claimed (by any client).
	 */
	isClaimed(key: string): boolean;
}
