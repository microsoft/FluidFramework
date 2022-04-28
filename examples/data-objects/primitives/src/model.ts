/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import {
    DataObject,
    DataObjectFactory,
} from "@fluidframework/aqueduct";
import { IFluidHandle } from "@fluidframework/core-interfaces";
import { IDirectory, ISharedMap, SharedMap } from "@fluidframework/map";

export interface INamedMap {
    name: string;
    map: ISharedMap;
}

export const DdsCollectionName = "DdsCollection";

/**
 * Basic DDS examples using view interfaces and stock component classes.
 */
export class DdsCollection extends DataObject {
    private internalMapDir: IDirectory | undefined;
    protected get mapDir(): IDirectory { return this.tryGetDds(this.internalMapDir, "mapDir"); }

    /**
     * initializingFirstTime is called only once, it is executed only by the first client to open the
     * component and all work will resolve before the view is presented to any user.
     *
     * This method is used to perform component setup, which can include setting an initial schema or initial values.
     */
    protected async initializingFirstTime() {
        this.root.createSubDirectory("map");
    }

    protected async hasInitialized() {
        this.internalMapDir = this.root.getSubDirectory("map");
        this.mapDir.on("containedValueChanged", () => { this.emit("mapsChanged"); });
    }

    public readonly hasMap = (name: string) => {
        return this.mapDir.get(name) !== undefined;
    };

    public readonly getMaps = async () => {
        const namedMaps: INamedMap[] = [];
        for (const [name, mapHandle] of this.mapDir) {
            const map = await (mapHandle as IFluidHandle<ISharedMap>).get();
            namedMaps.push({ name, map });
        }
        namedMaps.sort((a, b) => a.name.localeCompare(b.name));
        return namedMaps;
    };

    public readonly addMap = (name: string) => {
        const newMap = SharedMap.create(this.runtime, name);
        newMap.bindToContext();
        this.mapDir.set(name, newMap.handle);
    };

    private tryGetDds<T>(dds: T | undefined, id: string): T {
        if (dds === undefined) {
            throw Error(`${id} must be initialized before being accessed.`);
        }
        return dds;
    }
}

/**
 * The DataObjectFactory declares the component and defines any additional distributed data structures.
 * To add a SharedSequence, SharedMap, or any other structure, put it in the array below.
 */
 export const DdsCollectionFactory =
    new DataObjectFactory(
        DdsCollectionName,
        DdsCollection,
        [
            SharedMap.getFactory(),
        ],
        {},
    );
