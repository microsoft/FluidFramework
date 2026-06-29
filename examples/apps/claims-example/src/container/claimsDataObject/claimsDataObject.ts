/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { ClaimsKind, type IClaims } from "@fluid-internal/claims";
import { DataObject, DataObjectFactory } from "@fluidframework/aqueduct/legacy";
import type { IFluidHandle } from "@fluidframework/core-interfaces";
import {
	type IDirectory,
	type ISharedDirectory,
	SharedDirectory,
} from "@fluidframework/map/legacy";

import type { IClaimsDataObject, IClaimsDataObjectEvents } from "./interface.js";

/**
 * Key under which the Claims DDS handle is stored on the root directory.
 */
const claimsHandleKey = "claims";

/**
 * Name of the root subdirectory used to mirror the set of claimed keys.
 *
 * @remarks
 * The Claims DDS does not expose a way to enumerate its keys, so we mirror them into a
 * subdirectory of the data object's root. This lets a client that loads an existing document
 * (or joins late) discover which keys have already been claimed and resolve their winners.
 */
const claimedKeysDirName = "claimedKeys";

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
	private claims: IClaims<DirectoryHandle> | undefined;

	/**
	 * Subdirectory mirroring the claimed keys (see {@link claimedKeysDirName}). Set during
	 * initialization.
	 */
	private claimedKeysDir: IDirectory | undefined;

	/**
	 * Backing SharedDirectories for resolved winning claims, keyed by claim key.
	 */
	private readonly resolvedDirectories = new Map<string, ISharedDirectory>();

	private get claimsOrThrow(): IClaims<DirectoryHandle> {
		if (this.claims === undefined) {
			throw new Error("ClaimsDataObject not initialized");
		}
		return this.claims;
	}

	private get claimedKeysDirOrThrow(): IDirectory {
		if (this.claimedKeysDir === undefined) {
			throw new Error("ClaimsDataObject not initialized");
		}
		return this.claimedKeysDir;
	}

	public get claimedKeys(): readonly string[] {
		// Only keys whose winning directory has resolved are listed, so getOwner is always
		// defined for a listed key. The mirror subdirectory ({@link claimedKeysDirName}) is
		// used solely to rediscover and resolve keys when loading an existing document.
		return [...this.resolvedDirectories.keys()];
	}

	public getOwner(key: string): string | undefined {
		return this.resolvedDirectories.get(key)?.get(ownerKey);
	}

	/**
	 * Called once when the document is first created. Creates the Claims DDS and the mirror
	 * subdirectory and stores them on the root.
	 */
	protected override async initializingFirstTime(): Promise<void> {
		const claims = ClaimsKind.create(this.runtime) as IClaims<DirectoryHandle>;
		this.root.set(claimsHandleKey, claims.handle);
		this.root.createSubDirectory(claimedKeysDirName);
	}

	/**
	 * Called every time the data object is initialized. Resolves the Claims DDS and mirror
	 * subdirectory and wires up listeners so the local view stays in sync as claims are made.
	 */
	protected override async hasInitialized(): Promise<void> {
		const claimsHandle =
			this.root.get<IFluidHandle<IClaims<DirectoryHandle>>>(claimsHandleKey);
		if (claimsHandle === undefined) {
			throw new Error("Claims DDS handle missing from root");
		}
		this.claims = await claimsHandle.get();
		this.claimedKeysDir = this.root.getSubDirectory(claimedKeysDirName);

		// Switch to (resolve) a key's winning directory whenever it is claimed, locally or
		// remotely. This is also how a losing client ends up pointing at the winner.
		this.claimsOrThrow.events.on("claimed", (key) => this.onClaimed(key));

		// A late-joining client (or a reload of an existing document) discovers
		// already-claimed keys from the mirror and resolves each of their winners.
		for (const key of this.claimedKeysDirOrThrow.keys()) {
			this.resolve(key);
		}
	}

	public readonly trySetClaim = async (key: string): Promise<boolean> => {
		// Each attempt creates a fresh backing directory recording this client as the owner.
		// If the claim wins, this directory becomes the shared winner for the key.
		const directory = SharedDirectory.create(this.runtime);
		directory.set(ownerKey, this.claimant);

		const result = this.claimsOrThrow.trySetClaim(key, directory.handle as DirectoryHandle);

		// Connected claims come back "Pending"; await the op roundtrip for the real outcome.
		const outcome = result.status === "Pending" ? await result.promise : result;

		if (outcome.status === "Accepted") {
			// The "claimed" event resolves the winner, but resolve eagerly so the caller sees an
			// accurate result even in detached mode (where no op — and so no event — is produced).
			this.recordClaimedKey(key);
			this.resolve(key);
			return true;
		}

		if (outcome.status === "AlreadyClaimed") {
			// We lost the race: switch to the winner's directory instead of the one we created.
			const winner = await outcome.currentValue?.get();
			if (winner !== undefined) {
				this.adoptDirectory(key, winner);
			}
		}

		// Lost the race or aborted (e.g. disposed during the op).
		return false;
	};

	/**
	 * Handles the Claims DDS "claimed" event (fired on every client when a claim is accepted)
	 * by switching to the winning directory for the key.
	 */
	private onClaimed(key: string): void {
		this.resolve(key);
	}

	/**
	 * Records a claimed key in the mirror subdirectory so it is discoverable on reload. Only
	 * the winning client calls this. Idempotent — a no-op if the key is already recorded.
	 */
	private recordClaimedKey(key: string): void {
		const dir = this.claimedKeysDirOrThrow;
		if (!dir.has(key)) {
			dir.set(key, true);
		}
	}

	/**
	 * Resolves a key's winning handle to its backing directory and adopts it.
	 */
	private resolve(key: string): void {
		const handle = this.claimsOrThrow.get(key);
		if (handle === undefined) {
			return;
		}
		handle
			.get()
			.then((directory) => this.adoptDirectory(key, directory))
			.catch((error: unknown) => console.error(`Failed to resolve claim "${key}"`, error));
	}

	/**
	 * Adopts a resolved directory as the local winner for a key (once) and watches it for
	 * changes so the view reflects owner updates.
	 */
	private adoptDirectory(key: string, directory: ISharedDirectory): void {
		if (this.resolvedDirectories.get(key) === directory) {
			return; // Already adopted this exact directory.
		}
		this.resolvedDirectories.set(key, directory);
		directory.on("valueChanged", () => this.emit("claimsChanged"));
		this.emit("claimsChanged");
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
