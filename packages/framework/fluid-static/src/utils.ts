/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import type { DataObjectKind } from "@fluidframework/aqueduct/internal";
import type { MinimumVersionForCollab } from "@fluidframework/container-runtime/internal";
import type { FluidObjectKeys, IFluidLoadable } from "@fluidframework/core-interfaces";
import type {
	IChannelFactory,
	IFluidDataStoreRuntime,
} from "@fluidframework/datastore-definitions/internal";
import type {
	IFluidDataStoreContext,
	NamedFluidDataStoreRegistryEntry,
} from "@fluidframework/runtime-definitions/internal";
import type {
	ISharedObjectKind,
	SharedObjectKind,
} from "@fluidframework/shared-object-base/internal";
import { UsageError } from "@fluidframework/telemetry-utils/internal";

import type { CompatibilityMode, LoadableObjectKind } from "./types.js";

/**
 * Runtime check to determine if an object is a {@link DataObjectKind}.
 */
export function isDataObjectKind<T extends IFluidLoadable>(
	obj: LoadableObjectKind<T>,
): obj is DataObjectKind<T>;

/**
 * Runtime check to determine if an object is a {@link DataObjectKind}.
 */
export function isDataObjectKind(
	obj: LoadableObjectKind,
): obj is DataObjectKind<IFluidLoadable>;

/**
 * Runtime check to determine if an object is a {@link DataObjectKind}.
 */
export function isDataObjectKind(
	obj: LoadableObjectKind,
): obj is DataObjectKind<IFluidLoadable> {
	const maybe = obj as Partial<DataObjectKind<IFluidLoadable>> | undefined;
	const isDataObject =
		maybe?.factory?.IFluidDataStoreFactory !== undefined &&
		maybe.factory.IFluidDataStoreFactory === maybe.factory;

	if (
		isDataObject ===
		((obj as Partial<ISharedObjectKind<IFluidLoadable>>).getFactory !== undefined)
	) {
		// TODO: Currently nothing in the types or docs requires an actual DataObjectClass to not have a member called "getFactory" so there is a risk of this being a false positive.
		// Refactoring the use of LoadableObjectClass such that explicit down casting is not required (for example by having a single factory API shared by both cases) could avoid problems like this.
		throw new UsageError("Invalid LoadableObjectClass");
	}

	return isDataObject;
}

/**
 * Runtime check to determine if a class is a SharedObject type
 */
export function isSharedObjectKind(
	obj: LoadableObjectKind,
): obj is ISharedObjectKind<IFluidLoadable> {
	return !isDataObjectKind(obj);
}

/**
 * The ContainerSchema consists of initialObjects and dynamicObjectTypes. These types can be
 * of both SharedObject or DataObject. This function separates the two and returns a registry
 * of DataObject types and an array of SharedObjects.
 */
export const parseDataObjectsFromSharedObjects = (
	objects: readonly SharedObjectKind[],
): [NamedFluidDataStoreRegistryEntry[], IChannelFactory[]] => {
	const registryEntries = new Set<NamedFluidDataStoreRegistryEntry>();
	const sharedObjects = new Set<IChannelFactory>();

	const tryAddObject = (obj: LoadableObjectKind): void => {
		if (isSharedObjectKind(obj)) {
			sharedObjects.add(obj.getFactory());
		} else if (isDataObjectKind(obj)) {
			registryEntries.add([obj.factory.type, Promise.resolve(obj.factory)]);
		} else {
			throw new Error(`Entry is neither a DataObject or a SharedObject`);
		}
	};

	// Add the object types that will be initialized
	const dedupedObjects = new Set(objects);
	for (const obj of dedupedObjects) {
		tryAddObject(obj as unknown as LoadableObjectKind);
	}

	if (registryEntries.size === 0 && sharedObjects.size === 0) {
		throw new Error("Container cannot be initialized without any DataTypes");
	}

	return [[...registryEntries], [...sharedObjects]];
};

/**
 * Creates a new data object of the specified type.
 */
export async function createDataObject<T extends IFluidLoadable>(
	dataObjectClass: DataObjectKind<T>,
	context: IFluidDataStoreContext,
): Promise<T> {
	const factory = dataObjectClass.factory;
	const packagePath = [...context.packagePath, factory.type];
	const dataStore = await context.containerRuntime.createDataStore(packagePath);
	const entryPoint = await dataStore.entryPoint.get();
	return entryPoint as T;
}

/**
 * Creates a new shared object of the specified type.
 */
export function createSharedObject<T extends IFluidLoadable>(
	sharedObjectClass: ISharedObjectKind<T>,
	runtime: IFluidDataStoreRuntime,
): T {
	const factory = sharedObjectClass.getFactory();
	const obj = runtime.createChannel(undefined, factory.type);
	return obj as unknown as T;
}

/**
 * Creates a Fluid object that has a property with the key `providerKey` that points to itself.
 * @remarks This is useful for creating objects that need to reference themselves, such as DataObjects.
 */
export function makeFluidObject<
	T extends object,
	K extends FluidObjectKeys<T> = FluidObjectKeys<T>,
>(object: Omit<T, K>, providerKey: K): T {
	return Object.defineProperty(object, providerKey, { value: object }) as T;
}

/**
 * Maps CompatibilityMode to a semver valid string that can be passed to the container runtime.
 */
export const compatibilityModeToMinVersionForCollab = {
	"1": "1.0.0",
	"2": "2.0.0",
} as const satisfies Record<CompatibilityMode, MinimumVersionForCollab>;
