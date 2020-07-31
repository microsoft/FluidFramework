/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { IProvideFluidDataStoreFactory } from "./componentFactory";

declare module "@fluidframework/component-core-interfaces" {
    // eslint-disable-next-line @typescript-eslint/no-empty-interface
    export interface IComponent extends Readonly<Partial<IProvideFluidDataStoreRegistry>> { }
    // eslint-disable-next-line @typescript-eslint/no-empty-interface
    export interface IFluidObject extends Readonly<Partial<IProvideFluidDataStoreRegistry>> { }
}

/**
 * A single registry entry that may be used to create components
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
 * An association of identifiers to component registry entries, where the
 * entries can be used to create components.
 */
export interface IFluidDataStoreRegistry extends IProvideFluidDataStoreRegistry {
    get(name: string): Promise<FluidDataStoreRegistryEntry | undefined>;
}
