/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { IProvideFluidDataStoreFactory } from "./dataStoreFactory";

/**
 * A single registry entry that may be used to create data stores.
 *
 * @remarks It must have either factory or registry, or both.
 *
 * @public
 */
export type FluidDataStoreRegistryEntry = Readonly<
	Partial<IProvideFluidDataStoreRegistry & IProvideFluidDataStoreFactory>
>;

/**
 * An associated pair of an identifier and registry entry.
 *
 * @remarks Registry entries may be dynamically loaded.
 *
 * @public
 */
export type NamedFluidDataStoreRegistryEntry = [string, Promise<FluidDataStoreRegistryEntry>];

/**
 * An iterable identifier/registry entry pair list.
 *
 * @public
 */
export type NamedFluidDataStoreRegistryEntries = Iterable<NamedFluidDataStoreRegistryEntry>;

/**
 * @public
 */
export const IFluidDataStoreRegistry: keyof IProvideFluidDataStoreRegistry =
	"IFluidDataStoreRegistry";

/**
 * @public
 */
export interface IProvideFluidDataStoreRegistry {
	readonly IFluidDataStoreRegistry: IFluidDataStoreRegistry;
}

/**
 * An association of identifiers to data store registry entries, where the
 * entries can be used to create data stores.
 *
 * @public
 */
export interface IFluidDataStoreRegistry extends IProvideFluidDataStoreRegistry {
	get(name: string): Promise<FluidDataStoreRegistryEntry | undefined>;
}
