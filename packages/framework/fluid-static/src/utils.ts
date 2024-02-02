/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { type IChannelFactory } from "@fluidframework/datastore-definitions";
import {
	type IFluidDataStoreFactory,
	type NamedFluidDataStoreRegistryEntry,
} from "@fluidframework/runtime-definitions";
import { type IFluidLoadable } from "@fluidframework/core-interfaces";
import { type ContainerSchema, type DataObjectClass, type SharedObjectClass } from "./types";

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
export const isDataObjectClass = (obj: unknown): obj is InternalDataObjectClass<IFluidLoadable> => {
	const maybe = obj as Partial<InternalDataObjectClass<IFluidLoadable>> | undefined;
	return (
		maybe?.factory?.IFluidDataStoreFactory !== undefined &&
		maybe?.factory?.IFluidDataStoreFactory === maybe?.factory
	);
};

/**
 * Runtime check to determine if a class is a SharedObject type
 */
export const isSharedObjectClass = (obj: unknown): obj is SharedObjectClass<IFluidLoadable> => {
	const maybe = obj as Partial<SharedObjectClass<IFluidLoadable>> | undefined;
	return maybe?.getFactory !== undefined;
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

	const tryAddObject = (obj: unknown): void => {
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
	for (const obj of dedupedObjects) {
		tryAddObject(obj);
	}

	if (registryEntries.size === 0 && sharedObjects.size === 0) {
		throw new Error("Container cannot be initialized without any DataTypes");
	}

	return [[...registryEntries], [...sharedObjects]];
};
