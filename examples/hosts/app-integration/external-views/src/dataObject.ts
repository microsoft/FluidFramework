/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { EventEmitter } from "events";
import { DataObject, DataObjectFactory } from "@fluidframework/aqueduct";

import { ISharedMap, SharedMap, IDirectoryValueChanged } from "@fluidframework/map";


export interface IKeyValueDataObject extends EventEmitter {
    on(event: "changed", listener: (args: IDirectoryValueChanged) => void): this;
    get: (key: string) => any;
    set: (key: string, value: any) => void
}

export class KeyValueDroplet extends DataObject implements IKeyValueDataObject {

    private dataMap: ISharedMap | undefined;

    protected async initializingFirstTime() {
        const initMap = SharedMap.create(this.runtime, 'name');
        this.root.set("map", initMap.handle);
    }

    protected async hasInitialized() {
        this.dataMap = await this.root.get("map").get();

        this.dataMap?.on("valueChanged", (changed) => {
            this.emit("changed", changed);
        });
    }

    public set = (key, value) => {
        this.dataMap?.set(key, value)
    }
    public get = (key: string) => {
        return this.dataMap?.get(key)
    }
}


export const KeyValueInstantiationFactory = new DataObjectFactory(
    "keyvalue-droplet",
    KeyValueDroplet,
    [],
    {},
);
