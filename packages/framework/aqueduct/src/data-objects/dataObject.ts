/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import type { IClaimAttempt, ISharedClaims } from "@fluidframework/claims-dds/internal";
import { SharedClaims } from "@fluidframework/claims-dds/internal";
import {
	type ISharedDirectory,
	MapFactory,
	SharedDirectory,
} from "@fluidframework/map/internal";

import { PureDataObject } from "./pureDataObject.js";
import type { DataObjectTypes } from "./types.js";

/**
 * DataObject is a base data store that is primed with a root directory. It
 * ensures that it is created and ready before you can access it.
 *
 * Having a single root directory allows for easier development. Instead of creating
 * and registering channels with the runtime any new DDS that is set on the root
 * will automatically be registered.
 *
 * @remarks
 * In addition to the {@link DataObject.root | root directory}, every
 * `DataObject` is automatically primed with a
 * {@link @fluidframework/claims-dds#SharedClaims | SharedClaims} channel
 * exposed through the {@link DataObject.trySetClaim},
 * {@link DataObject.getClaim}, and {@link DataObject.hasClaim} helpers.
 * Use a claim instead of `root.set` when you need to wire up a singleton
 * entry (typically a handle to a child DDS or data store) and want
 * first-writer-wins semantics — once a claim is sequenced it can never be
 * overwritten by another client. By contrast, `root.set` (and other DDS
 * writes) use last-writer-wins semantics, so two clients racing to
 * populate the same key will silently overwrite each other.
 *
 * @typeParam I - The optional input types used to strongly type the data object
 * @legacy
 * @beta
 */
export abstract class DataObject<
	I extends DataObjectTypes = DataObjectTypes,
> extends PureDataObject<I> {
	private internalRoot: ISharedDirectory | undefined;
	private internalClaims: ISharedClaims | undefined;
	private readonly rootDirectoryId = "root";
	private readonly claimsChannelId = "claims";

	/**
	 * The root directory will either be ready or will return an error. If an error is thrown
	 * the root has not been correctly created/set.
	 */
	protected get root(): ISharedDirectory {
		if (!this.internalRoot) {
			throw new Error(this.getUninitializedErrorString(`root`));
		}

		return this.internalRoot;
	}

	/**
	 * Attempts to set a first-writer-wins claim on this data object.
	 *
	 * Returns synchronously with an {@link IClaimAttempt} describing the
	 * immediate state. Its {@link IClaimAttempt.status} is `"Success"` or
	 * `"AlreadyClaimed"` when the outcome is already known locally
	 * (detached, or the key was previously sequenced), and `"Pending"`
	 * otherwise (e.g. while disconnected or while the op is in flight).
	 * Callers can branch on the status immediately for race / fallback
	 * logic and await {@link IClaimAttempt.result} to observe the final
	 * sequenced outcome.
	 *
	 * See {@link DataObject} class remarks for when to use a claim vs.
	 * writing to {@link DataObject.root | root}.
	 *
	 * @param key - The claim key (non-empty string).
	 * @param value - The JSON-serializable value to claim. May contain
	 * {@link @fluidframework/core-interfaces#IFluidHandle} instances; these
	 * are encoded the same way as handles in any other DDS value and
	 * contribute outbound routes to garbage collection.
	 * @returns An {@link IClaimAttempt} carrying the immediate status and
	 * a promise for the eventual sequenced result.
	 *
	 * @internal
	 */
	protected trySetClaim(key: string, value: unknown): IClaimAttempt {
		return this.getClaims().trySetClaim(key, value);
	}

	/**
	 * Returns the value of a previously-claimed key, or `undefined` if the
	 * key has not been claimed. Embedded handles are decoded.
	 *
	 * @internal
	 */
	protected getClaim(key: string): unknown {
		return this.getClaims().getClaim(key);
	}

	/**
	 * Returns `true` if a claim has been sequenced for the given key.
	 *
	 * @internal
	 */
	protected hasClaim(key: string): boolean {
		return this.getClaims().hasClaim(key);
	}

	private getClaims(): ISharedClaims {
		if (!this.internalClaims) {
			throw new Error(this.getUninitializedErrorString(`claims`));
		}
		return this.internalClaims;
	}

	/**
	 * Initializes internal objects and calls initialization overrides.
	 * Caller is responsible for ensuring this is only invoked once.
	 */
	public override async initializeInternal(existing: boolean): Promise<void> {
		if (existing) {
			// data store has a root directory so we just need to set it before calling initializingFromExisting
			this.internalRoot = (await this.runtime.getChannel(
				this.rootDirectoryId,
			)) as ISharedDirectory;

			// This will actually be an ISharedMap if the channel was previously created by the older version of
			// DataObject which used a SharedMap.  Since SharedMap and SharedDirectory are compatible unless
			// SharedDirectory-only commands are used on SharedMap, this will mostly just work for compatibility.
			if (this.internalRoot.attributes.type === MapFactory.Type) {
				this.runtime.logger.send({
					category: "generic",
					eventName: "MapDataObject",
					message:
						"Legacy document, SharedMap is masquerading as SharedDirectory in DataObject",
				});
			}

			// The claims channel is added by this version of DataObject; legacy
			// documents (created before this change) will not have it. Try to
			// load it, and fall back to creating it locally so older documents
			// can still use the claim helpers in-process. The locally-created
			// channel will be persisted on the next summary and become visible
			// to other clients with this version of DataObject.
			try {
				this.internalClaims = (await this.runtime.getChannel(
					this.claimsChannelId,
				)) as unknown as ISharedClaims;
			} catch {
				const created = SharedClaims.create(this.runtime, this.claimsChannelId);
				created.bindToContext();
				this.internalClaims = created;
			}
		} else {
			// Create a root directory and register it before calling initializingFirstTime
			this.internalRoot = SharedDirectory.create(this.runtime, this.rootDirectoryId);
			this.internalRoot.bindToContext();

			// Create and register the auto-installed claims channel.
			const claims = SharedClaims.create(this.runtime, this.claimsChannelId);
			claims.bindToContext();
			this.internalClaims = claims;
		}

		await super.initializeInternal(existing);
	}

	/**
	 * Generates an error string indicating an item is uninitialized.
	 * @param item - The name of the item that was uninitialized.
	 */
	protected getUninitializedErrorString(item: string): string {
		return `${item} must be initialized before being accessed.`;
	}
}
