/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import {
    DirectoryFactory,
    MapFactory,
    SharedDirectory,
    SharedMap,
} from "@fluidframework/map";
import { IEvent } from "@fluidframework/common-definitions";
import {
    NamedFluidDataStoreRegistryEntries,
} from "@fluidframework/runtime-definitions";
import { IChannelFactory } from "@fluidframework/datastore-definitions";
import { FluidObjectSymbolProvider } from "@fluidframework/synthesize";
import {
    FluidDataStoreRuntime,
    summaryFluidDataStoreMixin,
 } from "@fluidframework/datastore";

import { DataObject, IDataObjectProps } from "../data-objects";
import { PureDataObjectFactory } from "./pureDataObjectFactory";

/**
 * DataObjectFactory is the IFluidDataStoreFactory for use with DataObjects.
 * It facilitates DataObject's features (such as its shared directory) by
 * ensuring relevant shared objects etc are available to the factory.
 *
 * Generics:
 * O - represents a type that will define optional providers that will be injected
 * S - the initial state type that the produced data object may take during creation
 */
export class DataObjectFactory<TObj extends DataObject<O, S, E>, O, S, E extends IEvent = IEvent>
    extends PureDataObjectFactory<TObj, O, S, E>
{
    constructor(
        type: string,
        ctor: new (props: IDataObjectProps<O, S>) => TObj,
        sharedObjects: readonly IChannelFactory[] = [],
        optionalProviders: FluidObjectSymbolProvider<O>,
        registryEntries?: NamedFluidDataStoreRegistryEntries,
        runtimeFactory: typeof FluidDataStoreRuntime = FluidDataStoreRuntime,
    ) {
        const mergedObjects = [...sharedObjects];

        if (!sharedObjects.find((factory) => factory.type === DirectoryFactory.Type)) {
            // User did not register for directory
            mergedObjects.push(SharedDirectory.getFactory());
        }

        // TODO: Remove SharedMap factory when compatibility with SharedMap DataObject is no longer needed in 0.10
        if (!sharedObjects.find((factory) => factory.type === MapFactory.Type)) {
            // User did not register for map
            mergedObjects.push(SharedMap.getFactory());
        }

        super(
            type,
            ctor,
            mergedObjects,
            optionalProviders,
            registryEntries,
            runtimeFactory,
        );
    }
}

// This is just an example!
// This code will not be here, it needs to be in FCL, as this is contract between SPO and
// Office Fluid container / components.
// For time being, this code will be in Office Bohemia code base.
export interface SearchableDataObject
{
    searchHandler(): Promise<string>;
}

export function createSearchDataObjectFactory<
    TObj extends DataObject<O, S, E> & SearchableDataObject,
    O, S, E extends IEvent = IEvent>(
        type: string,
        ctor: new (props: IDataObjectProps<O, S>) => TObj,
        sharedObjects: readonly IChannelFactory[] = [],
        optionalProviders: FluidObjectSymbolProvider<O>,
        registryEntries?: NamedFluidDataStoreRegistryEntries,
        runtimeFactory: typeof FluidDataStoreRuntime = FluidDataStoreRuntime) {
    const runtimeFactory2 = summaryFluidDataStoreMixin(async (runtime: FluidDataStoreRuntime) => {
        const obj = await DataObject.getDataObject(runtime) as any as SearchableDataObject;
        const content = await obj.searchHandler();
        return {
            path: ["_search", "01"],
            content,
        };
    }, runtimeFactory);

    return new DataObjectFactory(type, ctor, sharedObjects, optionalProviders, registryEntries, runtimeFactory2);
}

//
// Usage example
//
export class SearchableDataObjectExample extends DataObject implements SearchableDataObject {
    private static readonly factory = createSearchDataObjectFactory(
        "SearchableSample",
        SearchableDataObjectExample,
        [],
        {},
    );

    public static getFactory() { return this.factory; }

    public async searchHandler(): Promise<string> {
        return "some content to be indexed";
    }
}
