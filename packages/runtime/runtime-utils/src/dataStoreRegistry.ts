/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */
import {
    FluidDataStoreRegistryEntry,
    IFluidDataStoreRegistry,
    IProvideFluidDataStoreFactory,
} from "@fluidframework/runtime-definitions";

export class FluidDataStoreRegistry implements IFluidDataStoreRegistry {
    private readonly map: Map<string, FluidDataStoreRegistryEntry | Promise<FluidDataStoreRegistryEntry>> = new Map();

    public get IFluidDataStoreRegistry() { return this; }

    constructor(namedEntries: Iterable<
        [string, FluidDataStoreRegistryEntry | Promise<FluidDataStoreRegistryEntry>] |
        IProvideFluidDataStoreFactory
        >) {
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
