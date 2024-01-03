/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { IChannelFactory } from "@fluidframework/datastore-definitions";
import {
	IFluidDataStoreFactory,
	NamedFluidDataStoreRegistryEntry,
} from "@fluidframework/runtime-definitions";
import { IFluidLoadable } from "@fluidframework/core-interfaces";
import { ContainerSchema, DataObjectClass, LoadableObjectClass, SharedObjectClass } from "./types";

/**
 * An internal type used by the internal type guard isDataObjectClass to cast a
 * DataObjectClass to a type that is strongly coupled to IFluidDataStoreFactory.
 * Unlike the external and exported type DataObjectClass  which is
 * weakly coupled to the IFluidDataStoreFactory to prevent leaking internals.
 */
export type InternalDataObjectClass<T extends IFluidLoadable> = DataObjectClass<T> &
	Record<"factory", IFluidDataStoreFactory>;

/**
 * Runtime check to determine if a class is a DataObject type
 */
export const isDataObjectClass = (obj: any): obj is InternalDataObjectClass<IFluidLoadable> => {
	const maybe: Partial<InternalDataObjectClass<IFluidLoadable>> | undefined = obj;
	return (
		maybe?.factory?.IFluidDataStoreFactory !== undefined &&
		maybe?.factory?.IFluidDataStoreFactory === maybe?.factory
	);
};

/**
 * Runtime check to determine if a class is a SharedObject type
 */
export const isSharedObjectClass = (obj: any): obj is SharedObjectClass<any> => {
	return obj?.getFactory !== undefined;
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
			sharedObjects.add(obj.getFactory());
		} else if (isDataObjectClass(obj)) {
			registryEntries.add([obj.factory.type, Promise.resolve(obj.factory)]);
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
