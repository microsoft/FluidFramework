/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { FluidObjectKeys, IFluidLoadable } from "@fluidframework/core-interfaces";
import { Serializable } from "@fluidframework/datastore-definitions";
import { IFluidDataStoreFactory } from "@fluidframework/runtime-definitions";
import { IFluidHTMLView } from "@fluidframework/view-interfaces";

export const IFluidObjectInternalRegistry: keyof IProvideFluidObjectInternalRegistry = "IFluidObjectInternalRegistry";

export type DefaultRegistryTypes = IFluidHTMLView & IFluidLoadable;

export interface IProvideFluidObjectInternalRegistry<T=DefaultRegistryTypes> {
    readonly IFluidObjectInternalRegistry: IFluidObjectInternalRegistry<T>;
}

/**
 * Provides functionality to retrieve subsets of an internal registry.
 */
export interface IFluidObjectInternalRegistry<T=DefaultRegistryTypes> extends IProvideFluidObjectInternalRegistry<T> {
    getFromCapability(type: FluidObjectKeys<T>): IInternalRegistryEntry<T>[];
    hasCapability(type: string, capability: FluidObjectKeys<T>): boolean;
    getByFactory(factoryId: string): IInternalRegistryEntry | undefined;
    getAll(): IInternalRegistryEntry<T>[];
}

/**
 * A registry entry, with extra metadata.
 */
export interface IInternalRegistryEntry<T=DefaultRegistryTypes> {
    factory: IFluidDataStoreFactory;
    capabilities: FluidObjectKeys<T>[];
    friendlyName: string;
    fabricIconName: string;
    getView: (serializableObject: Serializable) => Promise<JSX.Element>;
}
