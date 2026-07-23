/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { ClaimsKind, type IClaims } from "@fluid-internal/claims";
import { DataObject, DataObjectFactory } from "@fluidframework/aqueduct/legacy";
import type { IFluidHandle } from "@fluidframework/core-interfaces";
import { type ISharedDirectory, SharedDirectory } from "@fluidframework/map/legacy";

import type { IClaimsDataObject, IClaimsDataObjectEvents } from "./interface.js";

/**
 * Key under which the Claims DDS handle is stored on the root directory.
 */
const claimsHandleKey = "claims";

/**
 * The keys clients compete to claim.
 *
 * @remarks
 * The Claims DDS is used the way a partner like Pages would use it: to claim a small, known
 * set of things per data object. Because the keys are known up front, nothing needs to be
 * enumerated — the view checks the owner of each known key directly, so there is no need to
 * discover keys or mirror them into a side structure.
 */
export const claimKey1 = "ClaimKey1";
export const claimKey2 = "ClaimKey2";

/**
 * Entry recorded on each resource's backing SharedDirectory.
 */
const ownerKey = "owner";

type DirectoryHandle = IFluidHandle<ISharedDirectory>;

interface IClaimsDataObjectTypes {
	Events: IClaimsDataObjectEvents;
}

/**
 * The root data object for the claims example.
 *
 * @remarks
 * It owns a single Claims DDS, created lazily the first time the document is created, and
 * exposes a small {@link IClaimsDataObject.trySetClaim} surface so the view never touches the
 * Claims DDS directly. Each claim's value is the handle of a freshly created `SharedDirectory`
 * recording its owner, so every client resolves the winning handle to the same shared object.
 */
export class ClaimsDataObject
	extends DataObject<IClaimsDataObjectTypes>
	implements IClaimsDataObject
{
	/**
	 * Each client (browser tab) gets its own identity, so claims made from different tabs
	 * compete with one another under first-writer-wins.
	 */
	public readonly claimant = `Client-${Math.random().toString(36).slice(2, 6)}`;

	/**
	 * The Claims DDS this data object abstracts. Set during initialization.
	 */
	private internalClaims: IClaims<DirectoryHandle> | undefined;

	/**
	 * Resolved owner of each winning claim, keyed by claim key.
	 *
	 * @remarks
	 * Claim values are handles, which resolve asynchronously, but the view reads owners
	 * synchronously while rendering. A winning directory's owner is written once and never
	 * changes, so this map memoizes the resolved owner string — letting {@link getOwner} stay
	 * synchronous without holding onto (or subscribing to) the backing directory.
	 */
	private readonly resolvedOwners = new Map<string, string>();

	private get claims(): IClaims<DirectoryHandle> {
		if (this.internalClaims === undefined) {
			throw new Error("ClaimsDataObject not initialized");
		}
		return this.internalClaims;
	}

	public getOwner(key: string): string | undefined {
		return this.resolvedOwners.get(key);
	}

	/**
	 * Called once when the document is first created. Creates the Claims DDS and stores its
	 * handle on the root.
	 */
	protected override async initializingFirstTime(): Promise<void> {
		const claims = ClaimsKind.create(this.runtime) as IClaims<DirectoryHandle>;
		this.root.set(claimsHandleKey, claims.handle);
	}

	/**
	 * Called every time the data object is initialized. Resolves the Claims DDS and wires up
	 * listeners so the local view stays in sync as claims are made.
	 */
	protected override async hasInitialized(): Promise<void> {
		const claimsHandle =
			this.root.get<IFluidHandle<IClaims<DirectoryHandle>>>(claimsHandleKey);
		if (claimsHandle === undefined) {
			throw new Error("Claims DDS handle missing from root");
		}
		this.internalClaims = await claimsHandle.get();

		// Resolve a key's winning owner whenever it is claimed, locally or remotely. This is also
		// how a losing client ends up reflecting the winner.
		this.claims.events.on("claimed", (key) => this.onClaimed(key));

		// Resolve the current winner (if any) for each known key so late joiners and reloads
		// render owners immediately. The key set is fixed, so no enumeration is needed.
		this.resolve(claimKey1);
		this.resolve(claimKey2);
	}

	public readonly trySetClaim = async (key: string): Promise<boolean> => {
		// Early-exit if we already know the key is claimed: resolve the winner without creating a
		// throwaway backing directory. This reflects only locally known state, so it is an
		// optimization — the authoritative race is still resolved by claims.trySetClaim below.
		if (this.claims.has(key)) {
			this.resolve(key);
			return false;
		}

		// Each attempt creates a fresh backing directory recording this client as the owner.
		// If the claim wins, this directory becomes the shared winner for the key.
		const directory = SharedDirectory.create(this.runtime);
		directory.set(ownerKey, this.claimant);

		const result = this.claims.trySetClaim(key, directory.handle as DirectoryHandle);

		// Connected claims come back "Pending"; await the op roundtrip for the real outcome.
		const outcome = result.status === "Pending" ? await result.promise : result;

		if (outcome.status === "Accepted") {
			// The "claimed" event resolves the winner, but resolve eagerly so the caller sees an
			// accurate result even in detached mode (where no op — and so no event — is produced).
			this.resolve(key);
			return true;
		}

		if (outcome.status === "AlreadyClaimed") {
			// We lost the race: resolve the winner's owner instead of the directory we created.
			this.resolve(key);
		}

		// Lost the race or aborted (e.g. disposed during the op).
		return false;
	};

	/**
	 * Handles the Claims DDS "claimed" event (fired on every client when a claim is accepted)
	 * by resolving the winning owner for the key.
	 */
	private onClaimed(key: string): void {
		this.resolve(key);
	}

	/**
	 * Resolves a key's winning handle to its backing directory, memoizes the owner (once), and
	 * notifies the view. The owner is written once at creation and never changes, so there is no
	 * need to retain or subscribe to the directory itself.
	 */
	private resolve(key: string): void {
		const handle = this.claims.get(key);
		if (handle === undefined) {
			return;
		}
		handle
			.get()
			.then((directory) => {
				const owner = directory.get<string>(ownerKey);
				if (owner !== undefined && this.resolvedOwners.get(key) !== owner) {
					this.resolvedOwners.set(key, owner);
					this.emit("claimsChanged");
				}
			})
			.catch((error: unknown) => console.error(`Failed to resolve claim "${key}"`, error));
	}
}

/**
 * The data object factory for {@link ClaimsDataObject}. Registers the Claims DDS factory; the
 * SharedDirectory factory (used for the root and each claim's backing directory) is registered
 * automatically by {@link DataObjectFactory}.
 */
export const ClaimsDataObjectFactory = new DataObjectFactory({
	type: "claims-data-object",
	ctor: ClaimsDataObject,
	sharedObjects: [ClaimsKind.getFactory()],
});
