/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { EventEmitter } from "events";
import { DataObject, DataObjectFactory } from "@fluidframework/aqueduct";
import { ISharedMap, SharedMap, IDirectoryValueChanged } from "@fluidframework/map";

/**
 * IKeyValueDataObject describes the public API surface for our KeyValue Droplet data object.
 */
export interface IKeyValueDataObject extends EventEmitter {
    /**
     * Get the dice value as a number.
     */
    get: (key: string) => any

    /**
     * Roll the dice.  Will cause a "diceRolled" event to be emitted.
     */
    set: (key: string, value: any) => void;

    /**
     * The diceRolled event will fire whenever someone rolls the device, either locally or remotely.
     */
    on(event: "changed", listener: (args: IDirectoryValueChanged) => void): this;
}

/**
 * The KeyValueDroplet is our data object that implements the IKeyValueDataObject interface.
 */
export class KeyValueDroplet extends DataObject implements IKeyValueDataObject {
    private dataMap: ISharedMap | undefined;

    /**
     * initializingFirstTime is run only once by the first client to create the DataObject.  Here we use it to
     * initialize the state of the DataObject.
     */
    protected async initializingFirstTime() {
        const initMap = SharedMap.create(this.runtime, "name");
        this.root.set("map", initMap.handle);
    }

    /**
     * hasInitialized is run by each client as they load the DataObject.  Here we use it to set up usage of the
     * DataObject, by registering an event listener for changes in data.
     */
    protected async hasInitialized() {
        this.dataMap = await this.root.get("map").get();

        this.dataMap?.on("valueChanged", (changed) => {
            this.emit("changed", changed);
        });
    }

    public set = (key: string, value: JSON) => {
        this.dataMap?.set(key, value);
    };

    public get = (key: string) => {
        // eslint-disable-next-line @typescript-eslint/no-unsafe-return
        return this.dataMap?.get(key);
    };
}

/**
 * The DataObjectFactory is used by Fluid Framework to instantiate our DataObject.  We provide it with a unique name
 * and the constructor it will call.  In this scenario, the third and fourth arguments are not used.
 */
export const KeyValueInstantiationFactory = new DataObjectFactory(
    "keyvalue-droplet",
    KeyValueDroplet,
    [],
    {},
);
