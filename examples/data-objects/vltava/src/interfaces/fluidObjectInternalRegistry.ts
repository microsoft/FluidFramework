/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { FluidObject, FluidObjectKeys } from "@fluidframework/core-interfaces";
import { IFluidDataStoreFactory } from "@fluidframework/runtime-definitions";

export const IFluidObjectInternalRegistry: keyof IProvideFluidObjectInternalRegistry = "IFluidObjectInternalRegistry";

export interface IProvideFluidObjectInternalRegistry<T=FluidObject> {
    readonly IFluidObjectInternalRegistry: IFluidObjectInternalRegistry<T>;
}

/**
 * Provides functionality to retrieve subsets of an internal registry.
 */
export interface IFluidObjectInternalRegistry<T> extends IProvideFluidObjectInternalRegistry<T> {
    getFromCapability(type: FluidObjectKeys<T>): IInternalRegistryEntry<T>[];
    hasCapability(type: string, capability: FluidObjectKeys<T>): boolean;
}

/**
 * A registry entry, with extra metadata.
 */
export interface IInternalRegistryEntry<T> {
    factory: IFluidDataStoreFactory;
    capabilities: FluidObjectKeys<T>[];
    friendlyName: string;
    fabricIconName: string;
}
