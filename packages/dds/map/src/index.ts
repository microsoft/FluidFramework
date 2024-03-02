/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

/**
 * The `map` library provides interfaces and implementing classes for map-like distributed data structures.
 *
 * @remarks The following distributed data structures are defined in this library:
 *
 * - {@link SharedMap}
 *
 * - {@link SharedDirectory}
 *
 * @packageDocumentation
 */

export {
	DirectoryFactory,
	ICreateInfo,
	IDirectoryClearOperation,
	IDirectoryCreateSubDirectoryOperation,
	IDirectoryDataObject,
	IDirectoryDeleteOperation,
	IDirectoryDeleteSubDirectoryOperation,
	IDirectoryKeyOperation,
	IDirectoryNewStorageFormat,
	IDirectoryOperation,
	IDirectorySetOperation,
	IDirectoryStorageOperation,
	IDirectorySubDirectoryOperation,
	SharedDirectory,
} from "./directory.js";
export {
	IDirectory,
	IDirectoryEvents,
	IDirectoryValueChanged,
	ISerializableValue,
	ISerializedValue,
	ISharedDirectory,
	ISharedDirectoryEvents,
	ISharedMap,
	ISharedMapEvents,
	IValueChanged,
} from "./interfaces.js";
export { LocalValueMaker, ILocalValue } from "./localValues.js";
export { MapFactory } from "./map.js";

import type {
	IChannelFactory,
	IFluidDataStoreRuntime,
} from "@fluidframework/datastore-definitions";
import { v4 as uuid } from "uuid";
import { MapFactory } from "./map.js";
import { ISharedMap } from "./interfaces.js";

/**
 * {@inheritDoc ISharedMap}
 * @public
 * @deprecated Please use SharedTree for new containers.  SharedMap is supported for loading preexisting Fluid Framework 1.0 containers only.
 */
export const SharedMap = {
	/**
	 * Get a factory for SharedMap to register with the data store.
	 * @returns A factory that creates SharedMaps and loads them from storage.
	 */
	getFactory(): IChannelFactory<ISharedMap> {
		return new MapFactory();
	},

	/**
	 * Create a new shared map.
	 * @param runtime - The data store runtime that the new shared map belongs to.
	 * @param id - Optional name of the shared map.
	 * @returns Newly created shared map.
	 *
	 * @example
	 * To create a `SharedMap`, call the static create method:
	 *
	 * ```typescript
	 * const myMap = SharedMap.create(this.runtime, id);
	 *
	 * @privateRemarks
	 * This alias is for legacy compat from when the SharedMap class exposed this static method.
	 * ```
	 */
	create(runtime: IFluidDataStoreRuntime, id?: string): ISharedMap {
		return this.getFactory().create(runtime, id ?? uuid());
	},
};

/**
 * {@inheritDoc ISharedMap}
 * @public
 * @deprecated Use ISharedMap instead.
 * @privateRemarks
 * This alias is for legacy compat from when the SharedMap class was exported as public.
 */
export type SharedMap = ISharedMap;
