/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { IFluidObject } from "@fluidframework/core-interfaces";
import { IProvideFluidDataStoreFactory } from "@fluidframework/runtime-definitions";

declare module "@fluidframework/core-interfaces" {
    // eslint-disable-next-line @typescript-eslint/no-empty-interface
    export interface IFluidObject extends Readonly<Partial<IProvideFluidObjectInternalRegistry>> { }
}

export const IFluidObjectInternalRegistry: keyof IProvideFluidObjectInternalRegistry = "IFluidObjectInternalRegistry";

export interface IProvideFluidObjectInternalRegistry {
    readonly IFluidObjectInternalRegistry: IFluidObjectInternalRegistry;
}

/**
 * Provides functionality to retrieve subsets of an internal registry.
 */
export interface IFluidObjectInternalRegistry extends IProvideFluidObjectInternalRegistry {
    getFromCapability(type: keyof (IFluidObject)): IInternalRegistryEntry[];
    hasCapability(type: string, capability: keyof (IFluidObject)): boolean;
}

/**
 * A registry entry, with extra metadata.
 */
export interface IInternalRegistryEntry {
    type: string;
    factory: Promise<IProvideFluidDataStoreFactory>;
    capabilities: (keyof (IFluidObject))[];
    friendlyName: string;
    fabricIconName: string;
}
