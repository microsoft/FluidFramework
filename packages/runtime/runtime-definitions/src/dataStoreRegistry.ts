/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import type { IProvideFluidDataStoreFactory } from "./dataStoreFactory.js";

/**
 * A single registry entry that may be used to create data stores
 * It has to have either factory or registry, or both.
 * @alpha
 */
export type FluidDataStoreRegistryEntry = Readonly<
	Partial<IProvideFluidDataStoreRegistry & IProvideFluidDataStoreFactory>
>;
/**
 * An associated pair of an identifier and registry entry.  Registry entries
 * may be dynamically loaded.
 * @alpha
 */
export type NamedFluidDataStoreRegistryEntry = [string, Promise<FluidDataStoreRegistryEntry>];
/**
 * An iterable identifier/registry entry pair list
 * @alpha
 */
export type NamedFluidDataStoreRegistryEntries = Iterable<NamedFluidDataStoreRegistryEntry>;

/**
 * @alpha
 */
export const IFluidDataStoreRegistry: keyof IProvideFluidDataStoreRegistry =
	"IFluidDataStoreRegistry";

/**
 * @alpha
 */
export interface IProvideFluidDataStoreRegistry {
	readonly IFluidDataStoreRegistry: IFluidDataStoreRegistry;
}

/**
 * An association of identifiers to data store registry entries, where the
 * entries can be used to create data stores.
 * @alpha
 */
export interface IFluidDataStoreRegistry extends IProvideFluidDataStoreRegistry {
	get(name: string): Promise<FluidDataStoreRegistryEntry | undefined>;
}
