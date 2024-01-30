/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { DirectoryFactory, MapFactory, SharedDirectory, SharedMap } from "@fluidframework/map";
import { type NamedFluidDataStoreRegistryEntries } from "@fluidframework/runtime-definitions";
import { type IChannelFactory } from "@fluidframework/datastore-definitions";
import { type FluidObjectSymbolProvider } from "@fluidframework/synthesize";
import { FluidDataStoreRuntime } from "@fluidframework/datastore";

import { type DataObject, type DataObjectTypes, type IDataObjectProps } from "../data-objects";
import { PureDataObjectFactory } from "./pureDataObjectFactory";

/**
 * DataObjectFactory is the IFluidDataStoreFactory for use with DataObjects.
 * It facilitates DataObject's features (such as its shared directory) by
 * ensuring relevant shared objects etc are available to the factory.
 *
 * @typeParam TObj - DataObject (concrete type)
 * @typeParam I - The input types for the DataObject
 * @alpha
 */
export class DataObjectFactory<
	TObj extends DataObject<I>,
	I extends DataObjectTypes = DataObjectTypes,
> extends PureDataObjectFactory<TObj, I> {
	public constructor(
		type: string,
		ctor: new (props: IDataObjectProps<I>) => TObj,
		sharedObjects: readonly IChannelFactory[] = [],
		optionalProviders: FluidObjectSymbolProvider<I["OptionalProviders"]>,
		registryEntries?: NamedFluidDataStoreRegistryEntries,
		runtimeFactory: typeof FluidDataStoreRuntime = FluidDataStoreRuntime,
	) {
		const mergedObjects = [...sharedObjects];

		if (!sharedObjects.some((factory) => factory.type === DirectoryFactory.Type)) {
			// User did not register for directory
			mergedObjects.push(SharedDirectory.getFactory());
		}

		// TODO: Remove SharedMap factory when compatibility with SharedMap DataObject is no longer needed in 0.10
		if (!sharedObjects.some((factory) => factory.type === MapFactory.Type)) {
			// User did not register for map
			mergedObjects.push(SharedMap.getFactory());
		}

		super(type, ctor, mergedObjects, optionalProviders, registryEntries, runtimeFactory);
	}
}
