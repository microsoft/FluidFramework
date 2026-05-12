/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import type { ClaimResult } from "@fluidframework/datastore-definitions/internal";
import {
	type ISharedDirectory,
	MapFactory,
	SharedDirectory,
} from "@fluidframework/map/internal";
import { UsageError } from "@fluidframework/telemetry-utils/internal";

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
 * In addition to the {@link DataObject.root | root directory}, `DataObject`
 * also exposes a first-writer-wins **claims** API:
 * {@link DataObject.trySetClaim}, {@link DataObject.getClaim}, and
 * {@link DataObject.hasClaim}. Use a claim instead of `root.set` when you
 * need to wire up a singleton entry (typically a handle to a child DDS or
 * data store) and want first-writer-wins semantics — once a claim is
 * sequenced it can never be overwritten by another client. By contrast,
 * `root.set` (and other DDS writes) use last-writer-wins semantics, so two
 * clients racing to populate the same key will silently overwrite each
 * other.
 *
 * Claims require the underlying data store runtime to have the
 * `enableDataStoreClaims` policy enabled.
 *
 * @typeParam I - The optional input types used to strongly type the data object
 * @legacy
 * @beta
 */
export abstract class DataObject<
	I extends DataObjectTypes = DataObjectTypes,
> extends PureDataObject<I> {
	private internalRoot: ISharedDirectory | undefined;
	private readonly rootDirectoryId = "root";

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
	 * Attempts to set a first-writer-wins claim on this data store. The
	 * promise resolves to `"Success"` if this client won the race for the
	 * key, or `"AlreadyClaimed"` if another client (including a previous
	 * incarnation of the same client) won. See {@link DataObject} class
	 * remarks for when to use a claim vs. writing to
	 * {@link DataObject.root | root}.
	 *
	 * @param key - The claim key (non-empty string).
	 * @param value - The JSON-serializable value to claim. May contain
	 * {@link @fluidframework/core-interfaces#IFluidHandle} instances; these
	 * are encoded the same way as handles in summary blobs and contribute
	 * outbound routes to garbage collection.
	 * @returns A promise that resolves to `"Success"` or `"AlreadyClaimed"`.
	 */
	protected async trySetClaim(key: string, value: unknown): Promise<ClaimResult> {
		if (this.runtime.trySetClaim === undefined) {
			throw new UsageError(
				"The data store runtime does not support claims. Enable the `enableDataStoreClaims` policy on the data store runtime to use this API.",
			);
		}
		return this.runtime.trySetClaim(key, value);
	}

	/**
	 * Returns the value of a previously-claimed key, or `undefined` if the
	 * key has not been claimed. Embedded handles are decoded.
	 */
	protected getClaim(key: string): unknown {
		return this.runtime.getClaim?.(key);
	}

	/**
	 * Returns `true` if a claim has been sequenced for the given key.
	 */
	protected hasClaim(key: string): boolean {
		return this.runtime.hasClaim?.(key) ?? false;
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
		} else {
			// Create a root directory and register it before calling initializingFirstTime
			this.internalRoot = SharedDirectory.create(this.runtime, this.rootDirectoryId);
			this.internalRoot.bindToContext();
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
