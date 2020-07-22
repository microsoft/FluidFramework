/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import {
    PrimedComponent,
    PrimedComponentFactory,
} from "@fluidframework/aqueduct";
import { IValueChanged } from "@fluidframework/map";

import { IDiceRoller } from "./interface";

const diceValueKey = "diceValue";

/**
 * The DiceRoller is our implementation of the IDiceRoller interface.
 */
export class DiceRoller extends PrimedComponent implements IDiceRoller {
    public static get ComponentName() { return "@fluid-example/dice-roller"; }

    /**
     * ComponentInitializingFirstTime is called only once, it is executed only by the first client to open the
     * component and all work will resolve before the view is presented to any user.
     *
     * This method is used to perform component setup, which can include setting an initial schema or initial values.
     */
    protected async componentInitializingFirstTime() {
        this.root.set(diceValueKey, 1);
    }

    protected async componentHasInitialized() {
        this.root.on("valueChanged", (changed: IValueChanged) => {
            if (changed.key === diceValueKey) {
                this.emit("diceRolled");
            }
        });
    }

    public get value() {
        return this.root.get(diceValueKey);
    }

    public readonly roll = () => {
        const rollValue = Math.floor(Math.random() * 6) + 1;
        this.root.set(diceValueKey, rollValue);
    };
}

/**
 * The PrimedComponentFactory declares the component and defines any additional distributed data structures.
 * To add a SharedSequence, SharedMap, or any other structure, put it in the array below.
 */
export const DiceRollerInstantiationFactory = new PrimedComponentFactory(
    DiceRoller.ComponentName,
    DiceRoller,
    [],
    {},
);
