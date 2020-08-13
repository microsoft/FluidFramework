/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { IProvideFluidDataStoreFactory } from "./dataStoreFactory";

declare module "@fluidframework/core-interfaces" {
    // eslint-disable-next-line @typescript-eslint/no-empty-interface
    export interface IFluidObject extends Readonly<Partial<IProvideFluidDataStoreRegistry>> { }
}

/**
 * A single registry entry that may be used to create data stores
* It has to have either factory or registry, or both.
 */
export type FluidDataStoreRegistryEntry =
    Readonly<Partial<IProvideFluidDataStoreRegistry & IProvideFluidDataStoreFactory>>;
/**
 * An associated pair of an identifier and registry entry.  Registry entries
 * may be dynamically loaded.
 */
export type NamedFluidDataStoreRegistryEntry = [string, Promise<FluidDataStoreRegistryEntry>];
/**
 * An iterable itentifier/registry entry pair list
 */
export type NamedFluidDataStoreRegistryEntries = Iterable<NamedFluidDataStoreRegistryEntry>;

export const IFluidDataStoreRegistry: keyof IProvideFluidDataStoreRegistry = "IFluidDataStoreRegistry";

export interface IProvideFluidDataStoreRegistry {
    readonly IFluidDataStoreRegistry: IFluidDataStoreRegistry;
}

/**
 * An association of identifiers to data store registry entries, where the
 * entries can be used to create data stores.
 */
export interface IFluidDataStoreRegistry extends IProvideFluidDataStoreRegistry {
    get(name: string): Promise<FluidDataStoreRegistryEntry | undefined>;
}
