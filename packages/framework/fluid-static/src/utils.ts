/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { IChannelFactory } from "@fluidframework/datastore-definitions";
import {
	IFluidDataStoreFactory,
	NamedFluidDataStoreRegistryEntry,
} from "@fluidframework/runtime-definitions";
import { FluidStaticEntryPoint } from "@fluidframework/core-interfaces";
import { ContainerSchema, LoadableObjectClass, _LoadableObjectClass } from "./types";

/**
 * Runtime check to determine if a class is a DataObject type
 */
export const isDataObjectClass = (
	obj: any,
): obj is _LoadableObjectClass<any> &
	Record<typeof FluidStaticEntryPoint, IFluidDataStoreFactory> => {
	return obj[FluidStaticEntryPoint].IFluidDataStoreFactory !== undefined;
};

/**
 * Runtime check to determine if a class is a SharedObject type
 */
export const isSharedObjectClass = (
	obj: any,
): obj is _LoadableObjectClass<any> & Record<typeof FluidStaticEntryPoint, IChannelFactory> => {
	return obj[FluidStaticEntryPoint].IChannelFactory !== undefined;
};

/**
 * The ContainerSchema consists of initialObjects and dynamicObjectTypes. These types can be
 * of both SharedObject or DataObject. This function seperates the two and returns a registery
 * of DataObject types and an array of SharedObjects.
 */
export const parseDataObjectsFromSharedObjects = (
	schema: ContainerSchema,
): [NamedFluidDataStoreRegistryEntry[], IChannelFactory[]] => {
	const registryEntries = new Set<NamedFluidDataStoreRegistryEntry>();
	const sharedObjects = new Set<IChannelFactory>();

	const tryAddObject = (obj: LoadableObjectClass<any>) => {
		if (isSharedObjectClass(obj)) {
			// eslint-disable-next-line @typescript-eslint/no-non-null-assertion
			sharedObjects.add(obj[FluidStaticEntryPoint].IChannelFactory!);
		} else if (isDataObjectClass(obj)) {
			registryEntries.add([
				obj[FluidStaticEntryPoint].IFluidDataStoreFactory.type,
				Promise.resolve(obj[FluidStaticEntryPoint].IFluidDataStoreFactory),
			]);
		} else {
			throw new Error(`Entry is neither a DataObject or a SharedObject`);
		}
	};

	// Add the object types that will be initialized
	const dedupedObjects = new Set([
		...Object.values(schema.initialObjects),
		...(schema.dynamicObjectTypes ?? []),
	]);
	dedupedObjects.forEach(tryAddObject);

	if (registryEntries.size === 0 && sharedObjects.size === 0) {
		throw new Error("Container cannot be initialized without any DataTypes");
	}

	return [Array.from(registryEntries), Array.from(sharedObjects)];
};
