/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { FluidObject, FluidObjectKeys } from "@fluidframework/core-interfaces";
import { IFluidDataStoreFactory } from "@fluidframework/runtime-definitions";

export const IFluidObjectInternalRegistry: keyof IProvideFluidObjectInternalRegistry = "IFluidObjectInternalRegistry";

export interface IProvideFluidObjectInternalRegistry {
    readonly IFluidObjectInternalRegistry: IFluidObjectInternalRegistry;
}

/**
 * Provides functionality to retrieve subsets of an internal registry.
 */
export interface IFluidObjectInternalRegistry extends IProvideFluidObjectInternalRegistry {
    getFromCapability<T>(type: keyof FluidObject<T>): IInternalRegistryEntry[];
    hasCapability<T>(type: string, capability: FluidObjectKeys<T>): boolean;
}

/**
 * A registry entry, with extra metadata.
 */
export interface IInternalRegistryEntry {
    factory: IFluidDataStoreFactory;
    capabilities: string[];
    friendlyName: string;
    fabricIconName: string;
}
