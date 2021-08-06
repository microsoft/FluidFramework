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
 * IDiceRoller describes the public API surface for our dice roller data object.
 */
export interface IDiceRoller extends EventEmitter {
    /**
     * Get a SharedString.
     */
    readonly sharedString: SharedString;

    /**
     * Get the dice value as a number.
     */
    readonly value: number;

    /**
     * Roll the dice.  Will cause a "diceRolled" event to be emitted.
     */
    roll: () => void;

    /**
     * The diceRolled event will fire whenever someone rolls the device, either locally or remotely.
     */
    on(event: "diceRolled", listener: () => void): this;
}

// The root is map-like, so we'll use this key for storing the value.
const diceValueKey = "diceValue";
const sharedStringKey = "sharedString";

/**
 * The DiceRoller is our data object that implements the IDiceRoller interface.
 */
export class DiceRoller extends DataObject implements IDiceRoller {
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
                // When we see the dice value change, we'll emit the diceRolled event we specified in our interface.
                this.emit("diceRolled");
            }
        });

        const sharedStringHandle = this.root.get<IFluidHandle<SharedString>>(sharedStringKey);
        if (sharedStringHandle === undefined) {
            throw new Error("Missing shared string");
        }
        this._sharedString = await sharedStringHandle.get();
    }

    public get value() {
        // eslint-disable-next-line @typescript-eslint/no-unsafe-return
        return this.root.get(diceValueKey);
    }

    public readonly roll = () => {
        const rollValue = Math.floor(Math.random() * 6) + 1;
        this.root.set(diceValueKey, rollValue);
    };
}

/**
 * The DataObjectFactory is used by Fluid Framework to instantiate our DataObject.  We provide it with a unique name
 * and the constructor it will call.  In this scenario, the third and fourth arguments are not used.
 */
export const DiceRollerInstantiationFactory = new DataObjectFactory<DiceRoller, undefined, undefined, IEvent>
(
    "dice-roller",
    DiceRoller,
    [SharedString.getFactory()],
    {},
);
