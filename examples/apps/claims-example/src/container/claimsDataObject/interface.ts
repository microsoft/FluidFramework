/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import type { IEvent, IEventProvider } from "@fluidframework/core-interfaces";

/**
 * Events emitted by an {@link IClaimsDataObject}.
 */
export interface IClaimsDataObjectEvents extends IEvent {
	/**
	 * Emitted whenever the set of claimed keys (or an owner) changes, locally or remotely.
	 */
	(event: "claimsChanged", listener: () => void);
}

/**
 * IClaimsDataObject is the root data object for the example. It owns a single Claims DDS and
 * abstracts that DDS's API behind a simple {@link IClaimsDataObject.trySetClaim} method, so the
 * view never has to touch the Claims DDS directly.
 *
 * @remarks
 * Each claimed key is paired with the `IFluidHandle` of a freshly created `SharedDirectory`
 * (a real DDS) that records its owner. Because the claim value is a handle, every client
 * resolves the *winning* directory to the same shared object — so even the client that loses
 * a race resolves the winner's directory to read the owner it recorded.
 */
export interface IClaimsDataObject extends IEventProvider<IClaimsDataObjectEvents> {
	/**
	 * The identity this client uses when it claims a key. Each client (browser tab) gets its
	 * own identity so first-writer-wins races between clients are easy to observe.
	 */
	readonly claimant: string;

	/**
	 * The identity of the client that owns a claimed key, or `undefined` if the key is
	 * unclaimed (or its winning directory hasn't finished resolving yet).
	 */
	getOwner(key: string): string | undefined;

	/**
	 * Attempts to claim a key using first-writer-wins semantics.
	 *
	 * @returns `true` if this client won the claim. If another client already owns the key the
	 * claim is rejected and `false` is returned; either way the data object resolves the winning
	 * key's owner (from the winner's directory) so {@link IClaimsDataObject.getOwner} reflects it.
	 */
	trySetClaim(key: string): Promise<boolean>;
}
