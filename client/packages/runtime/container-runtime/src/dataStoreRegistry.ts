/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */
import { UsageError } from "@fluidframework/container-utils";
import {
    FluidDataStoreRegistryEntry,
    IFluidDataStoreRegistry,
    NamedFluidDataStoreRegistryEntries,
} from "@fluidframework/runtime-definitions";

export class FluidDataStoreRegistry implements IFluidDataStoreRegistry {
    private readonly map: Map<string, FluidDataStoreRegistryEntry | Promise<FluidDataStoreRegistryEntry>>;

    public get IFluidDataStoreRegistry() { return this; }

    constructor(namedEntries: NamedFluidDataStoreRegistryEntries) {
        this.map = new Map();
        for (const entry of namedEntries) {
            if (this.map.has(entry[0])) {
                throw new UsageError("Duplicate entry names exist");
            }
            this.map.set(entry[0], entry[1]);
        }
    }

    public async get(name: string): Promise<FluidDataStoreRegistryEntry | undefined> {
        if (this.map.has(name)) {
            return this.map.get(name);
        }

        return undefined;
    }
}
