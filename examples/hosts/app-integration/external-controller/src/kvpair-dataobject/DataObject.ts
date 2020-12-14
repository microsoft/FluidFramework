/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { DataObject, DataObjectFactory } from "@fluidframework/aqueduct";
import { IDirectoryValueChanged, IValueChanged } from "@fluidframework/map";

/**
 * IKeyValueDataObject describes the public API surface for our KeyValue DataObject.
 */
export interface IKeyValueDataObject {
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
 * The KeyValueDataObject is our data object that implements the IKeyValueDataObject interface.
 */
export class KeyValueDataObject extends DataObject implements IKeyValueDataObject {
    /**
     * hasInitialized is run by each client as they load the DataObject.  Here we use it to set up usage of the
     * DataObject, by registering an event listener for changes in data.
     */
    protected async hasInitialized() {
        this.root.on("valueChanged", (changed: IValueChanged) => {
            this.emit("changed", changed);
        });
    }

    public set = (key: string, value: any) => {
        this.root.set(key, value);
    };

    public get = (key: string) => {
        // eslint-disable-next-line @typescript-eslint/no-unsafe-return
        return this.root.get(key);
    };
}

/**
 * The DataObjectFactory is used by Fluid Framework to instantiate our DataObject.  We provide it with a unique name
 * and the constructor it will call.  In this scenario, the third and fourth arguments are not used.
 */
export const KeyValueInstantiationFactory = new DataObjectFactory(
    "keyvalue-dataobject",
    KeyValueDataObject,
    [],
    {},
);
