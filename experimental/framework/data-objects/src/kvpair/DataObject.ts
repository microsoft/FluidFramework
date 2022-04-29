/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { EventEmitter } from "events";
import { DataObject, DataObjectFactory } from "@fluidframework/aqueduct";
import { IDirectoryValueChanged, IValueChanged } from "@fluidframework/map";

/**
 * IKeyValueDataObject describes the public API surface for our KeyValue DataObject.
 */
export interface IKeyValueDataObject extends EventEmitter {
    /**
     * Get value at Key
     */
    get: (key: string) => any;

    /**
     * Set Value at Key
     */
    set: (key: string, value: any) => void;

    /**
     * Event on value change
     */
    on(event: "changed", listener: (args: IDirectoryValueChanged) => void): this;

    /**
     * Returns all the keys
     */
    keys(): string[];

    /**
     * By default, returns an object containing all key value pairs
     * Filter test function can be passed to limit keys added to object
     */
    query: (test?: string | ((value: string) => boolean)) => any | { [key: string]: any }
}

/**
 * The KeyValueDataObject is our data object that implements the IKeyValueDataObject interface.
 */
export class KeyValueDataObject
    extends DataObject
    implements IKeyValueDataObject {
    public static readonly factory = new DataObjectFactory(
        "keyvalue-dataobject",
        KeyValueDataObject,
        [],
        {},
    );

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

    public keys = (): string[] => {
        return Array.from(this.root.keys());
    };

    public query = (test?: string | ((value: string) => boolean)): any | { [key: string]: any } => {
        let keys: string[] = [];
        if (!test) {
            keys = this.keys();
        } else if (typeof test === "string") {
            keys = [test];
        } else {
            keys = this.keys().filter(test);
        }

        const newQuery: { [key: string]: any } = {};
        keys.forEach((element: string) => {
            newQuery[element] = this.get(element);
        });
        return newQuery;
    };
}

/**
 * The DataObjectFactory is used by Fluid Framework to instantiate our DataObject.  We provide it with a unique name
 * and the constructor it will call.  In this scenario, the third and fourth arguments are not used.
 */
export const KeyValueInstantiationFactory = KeyValueDataObject.factory;
