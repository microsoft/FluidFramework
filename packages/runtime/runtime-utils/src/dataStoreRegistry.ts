/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */
import {
    FluidDataStoreRegistryEntry,
    IFluidDataStoreRegistry,
    NamedFluidDataStoreRegistryEntries,
} from "@fluidframework/runtime-definitions";

export class FluidDataStoreRegistry implements IFluidDataStoreRegistry {
    private readonly map: Map<string, Promise<FluidDataStoreRegistryEntry>>;

    public get IFluidDataStoreRegistry() { return this; }

    constructor(namedEntries: NamedFluidDataStoreRegistryEntries) {
        this.map = new Map(namedEntries);
    }

    public async get(name: string): Promise<FluidDataStoreRegistryEntry | undefined> {
        if (this.map.has(name)) {
            return this.map.get(name);
        }

        return undefined;
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
