/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */
import {
    FluidDataStoreRegistryEntry,
    IFluidDataStoreRegistry,
    NamedFluidDataStoreRegistryEntries,
} from "@fluidframework/runtime-definitions";

export class FluidDataStoreRegistry implements IFluidDataStoreRegistry {
    private readonly map: Map<string, FluidDataStoreRegistryEntry | Promise<FluidDataStoreRegistryEntry>>;

    public get IFluidDataStoreRegistry() { return this; }

    constructor(namedEntries: NamedFluidDataStoreRegistryEntries) {
        this.map = new Map(namedEntries);
        let countOfUniqueNames = 0;
        for (const _ of namedEntries) {
            countOfUniqueNames++;
        }
        if (this.map.size !== countOfUniqueNames) {
            throw new Error("Duplicate entry names exist");
        }
    }

    public async get(name: string): Promise<FluidDataStoreRegistryEntry | undefined> {
        if (this.map.has(name)) {
            return this.map.get(name);
        }

        return undefined;
    }
}
