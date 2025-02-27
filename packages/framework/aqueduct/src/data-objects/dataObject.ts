/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import {
	type ISharedDirectory,
	MapFactory,
	SharedDirectory,
} from "@fluidframework/map/internal";

import { PureDataObject } from "./pureDataObject.js";
import type { DataObjectKind, DataObjectTypes } from "./types.js";

/**
 * DataObject is a base data store that is primed with a root directory. It
 * ensures that it is created and ready before you can access it.
 *
 * Having a single root directory allows for easier development. Instead of creating
 * and registering channels with the runtime any new DDS that is set on the root
 * will automatically be registered.
 *
 * @typeParam I - The optional input types used to strongly type the data object
 * @legacy
 * @alpha
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

/**
 * Utility for creating SharedObjectKind instances for data objects.
 * @typeParam T - The kind of data object.
 * @internal
 */
export function createDataObjectKind<T extends DataObjectKind>(
	factory: T,
): T & SharedObjectKind<T extends DataObjectKind<infer I> ? I : unknown> {
	return factory as T & SharedObjectKind<T extends DataObjectKind<infer I> ? I : unknown>;
}
