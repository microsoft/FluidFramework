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
import { MapFactory } from "./map.js";
import { ISharedMap } from "./interfaces.js";

/**
 * {@inheritDoc ISharedMap}
 * @public
 * @deprecated Please use SharedTree for new containers.  SharedMap is supported for loading preexisting Fluid Framework 1.0 containers only.
 * @privateRemarks
 * TODO:
 * This type has a lot of docs which really should be deduplicated across all DDSes by having this object implement some interface (or two separate interfaces).
 */
export const SharedMap = {
	/**
	 * Get a factory for SharedMap to register with the data store.
	 * @remarks
	 * The produced factory is intended for use with the FluidDataStoreRegistry and is used by the Fluid Framework to instantiate already existing Channels.
	 * To create new shared objects, like SharedMaps use:
	 *
	 * - {@link @fluidframework/fluid-static#IFluidContainer.create} (and pass in `SharedMap`) if using `@fluidframework/fluid-static`, for example via `@fluidframework/azure-client`.
	 * - {@link (SharedMap:variable).create} when creating custom container definitions (and thus not using {@link @fluidframework/fluid-static#IFluidContainer.create}).
	 *
	 * @privateRemarks
	 * TODO:
	 * Many tests use this and can't use {@link (SharedMap:variable).create}.
	 * The docs should make it clear why thats ok, and why {@link (SharedMap:variable).create} isn't in such a way that when reading non app code (like tests in this package)
	 * someone can tell if the wrong one is being used without running it and seeing if it works.
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
	 * ```
	 * @remarks
	 * If using `@fluidframework/fluid-static` (for example via `@fluidframework/azure-client`), use {@link @fluidframework/fluid-static#IFluidContainer.create} (and pass in `SharedMap`) instead of calling this directly.
	 *
	 * @privateRemarks
	 * TODO:
	 * This returns null when used with MockFluidDataStoreRuntime, so its unclear how tests should create SharedMap instances unless using `RootDataObject.create` (which most tests shouldn't to minimize dependencies).
	 * In practice tests either avoid mock runtimes, use getFactory(), or call the map constructor directly. It is unclear (from docs) how getFactory().create differs but it does not rely on runtime.createChannel so it works with mock runtimes.
	 * TODO:
	 * See note on SharedMap.getFactory.
	 */
	create(runtime: IFluidDataStoreRuntime, id?: string): ISharedMap {
		return runtime.createChannel(id, MapFactory.Type) as ISharedMap;
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
