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
    mixinSummaryHander,
 } from "@fluidframework/datastore";
 import { assert } from "@fluidframework/common-utils";
 import { IFluidObject } from "@fluidframework/core-interfaces";

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
export interface ISearchableDataObject extends IProvideSearchableDataObject {
    searchHandler(): Promise<string>;
}

declare module "@fluidframework/core-interfaces" {
    // eslint-disable-next-line @typescript-eslint/no-empty-interface
    export interface IFluidObject extends Readonly<Partial<IProvideSearchableDataObject>> {
    }
}

export const ISearchableDataObject: keyof IProvideSearchableDataObject = "ISearchableDataObject";

export interface IProvideSearchableDataObject {
    readonly ISearchableDataObject: ISearchableDataObject;
}

export const createSearchDataStoreFactory = (runtimeFactory: typeof FluidDataStoreRuntime = FluidDataStoreRuntime) =>
    mixinSummaryHander(async (runtime: FluidDataStoreRuntime) => {
        const obj: IFluidObject = await DataObject.getDataObject(runtime) as IFluidObject;
        assert(obj.ISearchableDataObject !== undefined);
        const content = await obj.ISearchableDataObject.searchHandler();
        return {
            path: ["_search", "01"],
            content,
        };
    }, runtimeFactory);

//
// Usage example
//
export class SearchableDataObjectExample extends DataObject implements ISearchableDataObject {
    private static readonly factory = new DataObjectFactory(
        "SearchableSample",
        SearchableDataObjectExample,
        [],
        {},
        undefined,
        createSearchDataStoreFactory(),
    );

    public get ISearchableDataObject() { return this; }
    public static getFactory() { return this.factory; }

    public async searchHandler(): Promise<string> {
        return "some content to be indexed";
    }
}
