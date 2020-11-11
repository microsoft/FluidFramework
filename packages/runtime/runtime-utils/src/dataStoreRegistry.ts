/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */
import {
    FluidDataStoreRegistryEntry,
    IFluidDataStoreRegistry,
    FluidDataStoreRegistry,
    FluidDataStoreRegistryEntries,
    IProvideFluidDataStoreRegistry,
} from "@fluidframework/runtime-definitions";

export function createDataStoreRegistry(arg: FluidDataStoreRegistry): IFluidDataStoreRegistry {
    // Ensure that FluidDataStoreRegistry type did not change from original
    // We do casting below and need to ensure that only these two types can come in
    const entries: FluidDataStoreRegistryEntries | IFluidDataStoreRegistry = arg;

    const registry = (entries as IProvideFluidDataStoreRegistry).IFluidDataStoreRegistry;
    if (registry !== undefined) {
        return registry;
    }
    return new DataStoreRegistry(entries as FluidDataStoreRegistryEntries);
}

class DataStoreRegistry implements IFluidDataStoreRegistry {
    private readonly map: Map<string, FluidDataStoreRegistryEntry | Promise<FluidDataStoreRegistryEntry>> = new Map();

    public get IFluidDataStoreRegistry() { return this; }

    constructor(namedEntries: FluidDataStoreRegistryEntries) {
        for (const entry of namedEntries) {
            if (Array.isArray(entry)) {
                this.map.set(entry[0], entry[1]);
            } else {
                this.map.set(entry.IFluidDataStoreFactory.type, entry);
            }
        }
    }

    public async get(name: string): Promise<FluidDataStoreRegistryEntry | undefined> {
        return this.map.get(name);
    }
}

export class MultipleDataStoreRegistries implements IFluidDataStoreRegistry {
    private readonly registries: IFluidDataStoreRegistry[];

    get IFluidDataStoreRegistry() { return this; }

    constructor(...registries: IFluidDataStoreRegistry[]) {
        this.registries = registries;
    }
    public async get(name: string): Promise<FluidDataStoreRegistryEntry | undefined> {
        for (const reg of this.registries) {
            const res = await reg.get(name);
            if (res !== undefined) {
                return res;
            }
        }
        return undefined;
    }
}
