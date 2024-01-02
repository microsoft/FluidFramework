/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { IProvideFluidDataStoreFactory } from "./dataStoreFactory";

/**
 * A single registry entry that may be used to create data stores
 * It has to have either factory or registry, or both.
 * @internal
 */
export type FluidDataStoreRegistryEntry = Readonly<
	Partial<IProvideFluidDataStoreRegistry & IProvideFluidDataStoreFactory>
>;
/**
 * An associated pair of an identifier and registry entry.  Registry entries
 * may be dynamically loaded.
 * @internal
 */
export type NamedFluidDataStoreRegistryEntry = [string, Promise<FluidDataStoreRegistryEntry>];
/**
 * An iterable identifier/registry entry pair list
 * @internal
 */
export type NamedFluidDataStoreRegistryEntries = Iterable<NamedFluidDataStoreRegistryEntry>;

/**
 * @internal
 */
export const IFluidDataStoreRegistry: keyof IProvideFluidDataStoreRegistry =
	"IFluidDataStoreRegistry";

/**
 * @internal
 */
export interface IProvideFluidDataStoreRegistry {
	readonly IFluidDataStoreRegistry: IFluidDataStoreRegistry;
}

/**
 * An association of identifiers to data store registry entries, where the
 * entries can be used to create data stores.
 * @internal
 */
export interface IFluidDataStoreRegistry extends IProvideFluidDataStoreRegistry {
	get(name: string): Promise<FluidDataStoreRegistryEntry | undefined>;
}
