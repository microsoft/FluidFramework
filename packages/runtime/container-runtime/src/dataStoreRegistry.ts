/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */
import assert from "assert";
import {
    FluidDataStoreRegistryEntry,
    IFluidDataStoreRegistry,
    FluidDataStoreRegistryEntries,
    IFluidDataStoreContext,
    IProvideFluidDataStoreRegistry,
    IProvideFluidDataStoreFactory,
} from "@fluidframework/runtime-definitions";

export class FluidDataStoreRegistry implements IFluidDataStoreRegistry {
    private readonly map: Map<string, FluidDataStoreRegistryEntry> = new Map();

    public get IFluidDataStoreRegistry() { return this; }

    constructor(namedEntries: FluidDataStoreRegistryEntries) {
        for (const factory of namedEntries) {
            const type = factory.IFluidDataStoreFactory.type;
            assert(this.map.has(type), `Duplicate type: ${type}`);
            this.map.set(type, factory);
        }
    }

    public async get(name: string): Promise<FluidDataStoreRegistryEntry | undefined> {
        if (this.map.has(name)) {
            return this.map.get(name);
        }

        return undefined;
    }
}

/**
 * An adapter that allows to delay load factory. It can be used in cases where type
 * factory type is known upfront. Adapter validates that type supplied actually matches
 * factory type. If you need to overwrite name, please use RenamingFactoryAdapter
 */
export class DelayLoadingFactoryAdapter implements FluidDataStoreRegistryEntry {
    public constructor(
        public readonly type: string,
        private readonly factoryP: Promise<FluidDataStoreRegistryEntry>) {
    }

    public get IFluidDataStoreRegistry() { return this; }
    public get IFluidDataStoreFactory() { return this; }

    public async get(name: string): Promise<FluidDataStoreRegistryEntry | undefined> {
        const factory = await this.factoryP;
        assert(factory.IFluidDataStoreFactory.type === this.type);
        if (factory.IFluidDataStoreRegistry === undefined) {
            return undefined;
        }
        return factory.IFluidDataStoreRegistry.get(name);
    }

    public instantiateDataStore(context: IFluidDataStoreContext): void {
        // eslint-disable-next-line @typescript-eslint/no-floating-promises
        this.factoryP.then((factory) => {
            assert(factory.IFluidDataStoreFactory.type === this.type);
            factory.IFluidDataStoreFactory.instantiateDataStore(context);
        });
    }
}

/**
 * Takes existing factory, and produces another one like original, but with different name.
 * It allows registry without any factory to be used, throws if attempt to create component
 * with no factory happens.
 */
export class RenamingFactoryAdapter implements FluidDataStoreRegistryEntry {
    public constructor(
        public readonly type: string,
        private readonly factory: Partial<IProvideFluidDataStoreRegistry & IProvideFluidDataStoreFactory>) {
    }

    public get IFluidDataStoreRegistry() { return this.factory.IFluidDataStoreRegistry; }
    public get IFluidDataStoreFactory() { return this; }

    public async get(name: string): Promise<FluidDataStoreRegistryEntry | undefined> {
        return this.factory.IFluidDataStoreRegistry?.get(name);
    }

    public instantiateDataStore(context: IFluidDataStoreContext): void {
        if (this.factory.IFluidDataStoreFactory === undefined) {
            throw new Error(`RenamingFactoryAdapter with type=${this.type} does not have factory!`);
        }
        this.factory.IFluidDataStoreFactory.instantiateDataStore(context);
    }
}
