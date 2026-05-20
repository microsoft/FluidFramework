/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import type {
	ISharedObject,
	ISharedObjectEvents,
} from "@fluidframework/shared-object-base/internal";

/**
 * Final, sequenced outcome of a {@link ISharedClaims.trySetClaim} call.
 *
 * - `"Success"` - this client owns the claim for the given key.
 * - `"AlreadyClaimed"` - another client has already claimed the key; the
 *   existing value is unchanged. Claims are first-writer-wins and are
 *   immutable for the lifetime of the document.
 * @internal
 */
export type ClaimResult = "Success" | "AlreadyClaimed";

/**
 * The synchronous handle returned by {@link ISharedClaims.trySetClaim}.
 *
 * The shape is a discriminated union on {@link IClaimAttempt.status}:
 *
 * - When `status` is `"Success"` or `"AlreadyClaimed"`, the outcome is
 *   already known locally (detached, or the key was previously sequenced);
 *   no further work is required.
 * - When `status` is `"Pending"`, the outcome cannot be determined
 *   locally yet — for example, the client is attached but disconnected,
 *   or the op has been submitted but not yet sequenced. In that case,
 *   {@link IClaimAttempt.result} resolves to the eventual sequenced
 *   {@link ClaimResult}, or rejects if the runtime is disposed (or the
 *   attempt is discarded with staged changes) before the attempt is
 *   sequenced.
 *
 * Callers can branch on `status` synchronously for race / fallback logic
 * without ever creating a promise on the terminal paths.
 * @internal
 */
export type IClaimAttempt =
	| {
			readonly status: "Success" | "AlreadyClaimed";
	  }
	| {
			readonly status: "Pending";
			/**
			 * Resolves to the final sequenced {@link ClaimResult} once the op
			 * (this client's or another's) is sequenced. Rejects if the runtime
			 * is disposed, or if the attempt is discarded as part of exiting
			 * staging mode without committing, before the attempt is sequenced.
			 */
			readonly result: Promise<ClaimResult>;
	  };

/**
 * Events raised by {@link ISharedClaims}.
 * @internal
 */
export interface ISharedClaimsEvents extends ISharedObjectEvents {
	/**
	 * Fired whenever a claim for `key` has been sequenced (either locally
	 * or from a remote client). The provided `value` has handles decoded.
	 *
	 * @eventProperty
	 */
	(event: "claim-set", listener: (key: string, value: unknown) => void): void;
}

/**
 * A distributed data structure that stores immutable, first-writer-wins
 * key/value entries.
 *
 * @remarks
 * Each key can be set at most once for the lifetime of the document. The
 * first client whose op is sequenced for a given key "wins" the claim;
 * subsequent attempts to set the same key — whether from the same client
 * or any other — observe `"AlreadyClaimed"` and the stored value remains
 * unchanged. This is the opposite of the last-writer-wins behavior of
 * `SharedMap` / `SharedDirectory`.
 *
 * Values are JSON-serializable; embedded
 * {@link @fluidframework/core-interfaces#IFluidHandle | handles} are
 * encoded the same way as handles inside any other DDS value and
 * contribute outbound routes to garbage collection.
 *
 * @example
 * ```typescript
 * const claims = SharedClaims.create(runtime, "claims");
 * const attempt = claims.trySetClaim("logger", loggerHandle);
 * if (attempt.status === "Pending") {
 *   const outcome = await attempt.result;
 *   // outcome is "Success" or "AlreadyClaimed".
 * }
 * ```
 * @internal
 */
export interface ISharedClaims extends ISharedObject<ISharedClaimsEvents> {
	/**
	 * Attempts to set a first-writer-wins claim for `key`.
	 *
	 * Returns synchronously with an {@link IClaimAttempt} describing the
	 * immediate state. Callers can branch on
	 * {@link IClaimAttempt.status} immediately for race / fallback logic;
	 * awaiting {@link IClaimAttempt.result} (only present when status is
	 * `"Pending"`) yields the final sequenced {@link ClaimResult}.
	 *
	 * @param key - The non-empty claim key.
	 * @param value - The JSON-serializable value to claim. May contain
	 * {@link @fluidframework/core-interfaces#IFluidHandle} instances.
	 */
	trySetClaim(key: string, value: unknown): IClaimAttempt;

	/**
	 * Returns the sequenced value for `key`, or `undefined` if the key has
	 * not (yet) been claimed. Embedded handles are decoded.
	 */
	getClaim(key: string): unknown;

	/**
	 * Returns `true` if a claim has been sequenced for `key`.
	 */
	hasClaim(key: string): boolean;

	/**
	 * Read-only view of all sequenced claims, with embedded handles
	 * decoded.
	 */
	readonly claims: ReadonlyMap<string, unknown>;
}
