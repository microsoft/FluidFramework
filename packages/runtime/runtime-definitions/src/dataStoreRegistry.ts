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
 * An iterable identifier/registry entry pair list
 * @legacy
 * @alpha
 */
export type NamedFluidDataStoreRegistryEntries = Iterable<NamedFluidDataStoreRegistryEntry>;

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
	get(name: string): Promise<FluidDataStoreRegistryEntry | undefined>;
}
