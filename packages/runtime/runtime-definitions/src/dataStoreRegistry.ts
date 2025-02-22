/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import type { IProvideFluidDataStoreFactory } from "./dataStoreFactory.js";

/**
 * A single registry entry that may be used to create data stores
 * It has to have either factory or registry, or both.
 * @legacy
 * @alpha
 */
export type FluidDataStoreRegistryEntry = Readonly<
	Partial<IProvideFluidDataStoreRegistry & IProvideFluidDataStoreFactory>
>;
/**
 * An associated pair of an identifier and registry entry.  Registry entries
 * may be dynamically loaded.
 * @legacy
 * @alpha
 */
export type NamedFluidDataStoreRegistryEntry = [string, Promise<FluidDataStoreRegistryEntry>];

/**
 * An associated pair of an identifier and registry entry.  Registry entries
 * may be dynamically loaded.
 * @legacy
 * @alpha
 */
export type NamedFluidDataStoreRegistryEntry2 = [
	string,
	Promise<FluidDataStoreRegistryEntry> | FluidDataStoreRegistryEntry,
];
/**
 * An iterable identifier/registry entry pair list
 * @legacy
 * @alpha
 */
export type NamedFluidDataStoreRegistryEntries = Iterable<NamedFluidDataStoreRegistryEntry2>;

/**
 * @legacy
 * @alpha
 */
export const IFluidDataStoreRegistry: keyof IProvideFluidDataStoreRegistry =
	"IFluidDataStoreRegistry";

/**
 * @legacy
 * @alpha
 */
export interface IProvideFluidDataStoreRegistry {
	readonly IFluidDataStoreRegistry: IFluidDataStoreRegistry;
}

/**
 * An association of identifiers to data store registry entries, where the
 * entries can be used to create data stores.
 * @legacy
 * @alpha
 */
export interface IFluidDataStoreRegistry extends IProvideFluidDataStoreRegistry {
	/**
	 * Retrieves a data store registry entry by its identifier.
	 *
	 * @remarks
	 * The `get` function plays a crucial role in the lifecycle of a data store by providing access to the registry entry
	 * associated with a given identifier. This registry entry can then be used to create or load a data store.
	 *
	 * @param name - The unique identifier of the data store registry entry to retrieve.
	 * @returns A promise that resolves to the data store registry entry, or the entry itself, or undefined if not found.
	 */
	get(name: string): Promise<FluidDataStoreRegistryEntry | undefined>;

	/**
	 * Synchronously retrieves a data store registry entry by its identifier.
	 *
	 * @remarks
	 * The `get` function plays a crucial role in the lifecycle of a data store by providing access to the registry entry
	 * associated with a given identifier. This registry entry can then be used to create or load a data store.
	 *
	 * @param name - The unique identifier of the data store registry entry to retrieve.
	 * @returns The data store registry entry, or the entry itself, or undefined if not found.
	 */
	getSync?(name: string): FluidDataStoreRegistryEntry | undefined;
}
