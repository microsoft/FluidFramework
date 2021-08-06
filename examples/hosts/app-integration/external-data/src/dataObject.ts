/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { EventEmitter } from "events";
import { DataObject, DataObjectFactory } from "@fluidframework/aqueduct";
import { IEvent } from "@fluidframework/common-definitions";
import { IFluidHandle } from "@fluidframework/core-interfaces";
import { SharedString } from "@fluidframework/sequence";

/**
 * IInventoryList describes the public API surface for our inventory list object.
 */
export interface IInventoryList extends EventEmitter {
    /**
     * Get a SharedString.
     */
    readonly sharedString: SharedString;

    /**
     * The listChanged event will fire whenever an item is added/removed, either locally or remotely.
     */
    on(event: "listChanged", listener: () => void): this;
}

// The root is map-like, so we'll use this key for storing the value.
const diceValueKey = "diceValue";
const sharedStringKey = "sharedString";

/**
 * The InventoryList is our data object that implements the IInventoryList interface.
 */
export class InventoryList extends DataObject implements IInventoryList {
    private _sharedString: SharedString | undefined;
    public get sharedString() {
        if (this._sharedString === undefined) {
            throw new Error("Missing shared string");
        }
        return this._sharedString;
    }
    /**
     * initializingFirstTime is run only once by the first client to create the DataObject.  Here we use it to
     * initialize the state of the DataObject.
     */
    protected async initializingFirstTime() {
        this.root.set(diceValueKey, 1);
        const sharedString = SharedString.create(this.runtime);
        this.root.set(sharedStringKey, sharedString.handle);
    }

    /**
     * hasInitialized is run by each client as they load the DataObject.  Here we use it to set up usage of the
     * DataObject, by registering an event listener for dice rolls.
     */
    protected async hasInitialized() {
        this.root.on("valueChanged", (changed) => {
            if (changed.key === diceValueKey) {
                // When items are added or removed, we'll emit a listChanged event.
                this.emit("listChanged");
            }
        });

        const sharedStringHandle = this.root.get<IFluidHandle<SharedString>>(sharedStringKey);
        if (sharedStringHandle === undefined) {
            throw new Error("Missing shared string");
        }
        this._sharedString = await sharedStringHandle.get();
    }
}

/**
 * The DataObjectFactory is used by Fluid Framework to instantiate our DataObject.  We provide it with a unique name
 * and the constructor it will call.  The third argument lists the other data structures it will utilize.  In this
 * scenario, the fourth argument is not used.
 */
export const InventoryListInstantiationFactory = new DataObjectFactory<InventoryList, undefined, undefined, IEvent>
(
    "dice-roller",
    InventoryList,
    [SharedString.getFactory()],
    {},
);
