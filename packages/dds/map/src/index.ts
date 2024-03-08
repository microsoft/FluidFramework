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
import type { ISharedObjectKind } from "@fluidframework/shared-object-base";
import { MapFactory } from "./map.js";
import { ISharedMap } from "./interfaces.js";

/**
 * {@inheritDoc ISharedMap}
 * @public
 * @deprecated Please use SharedTree for new containers. SharedMap is supported for loading preexisting Fluid Framework 1.0 containers only.
 */
export const SharedMap: ISharedObjectKind<ISharedMap> = {
	getFactory(): IChannelFactory<ISharedMap> {
		return new MapFactory();
	},

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
