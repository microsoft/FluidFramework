/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import {
    DataObject,
    DataObjectFactory,
} from "@fluidframework/aqueduct";
import { IValueChanged } from "@fluidframework/map";
import { IFluidHTMLView } from "@fluidframework/view-interfaces";

import React from "react";
import ReactDOM from "react-dom";

import { IDiceRoller } from "./interface";
import { DiceRollerView } from "./view";

const diceValueKey = "diceValue";

/**
 * The DiceRoller is our implementation of the IDiceRoller interface.
 */
export class DiceRoller extends DataObject implements IDiceRoller, IFluidHTMLView {
    public static get Name() { return "@fluid-example/dice-roller"; }

    public get IFluidHTMLView() { return this; }

    /**
     * initializingFirstTime is called only once, it is executed only by the first client to open the
     * Fluid object and all work will resolve before the view is presented to any user.
     *
     * This method is used to perform Fluid object setup, which can include setting an initial schema or initial values.
     */
    protected async initializingFirstTime() {
        this.root.set(diceValueKey, 1);
    }

    protected async hasInitialized() {
        this.root.on("valueChanged", (changed: IValueChanged) => {
            if (changed.key === diceValueKey) {
                this.emit("diceRolled");
            }
        });
    }

    /**
     * Render the dice.
     */
    public render(div: HTMLElement) {
        ReactDOM.render(
            React.createElement(DiceRollerView, { model: this }),
            div,
        );
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
 * The DataObjectFactory declares the Fluid object and defines any additional distributed data structures.
 * To add a SharedSequence, SharedMap, or any other structure, put it in the array below.
 */
export const DiceRollerInstantiationFactory = new DataObjectFactory
(
    DiceRoller.Name,
    DiceRoller,
    [],
    {},
);
