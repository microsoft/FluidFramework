/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import {
    PrimedComponent,
    PrimedComponentFactory,
} from "@fluidframework/aqueduct";
import { IComponentHTMLView } from "@fluidframework/view-interfaces";

import React from "react";
import ReactDOM from "react-dom";

const diceValueKey = "diceValue";

interface IDiceRollerModelProps {
    /**
     * Get the dice value from the model as a number.
     */
    getValue: () => number;

    /**
     * Update the model to have a new dice value
     */
    roll: () => void;
}

/**
 * The DiceRoller is our implementation of the IDiceRoller interface.
 */
export class DiceRoller extends PrimedComponent implements IDiceRollerModelProps, IComponentHTMLView {
    public static get ComponentName() {
        return "@fluid-example/dice-roller";
    }

    public get IComponentHTMLView() {
        return this;
    }

    /**
     * ComponentInitializingFirstTime is called only once, it is executed only by the first client to open the
     * component and all work will resolve before the view is presented to any user.
     *
     * This method is used to perform component setup, which can include setting an initial schema or initial values.
     */
    protected async componentInitializingFirstTime() {
        this.root.set(diceValueKey, 1);
    }

    /**
     * Render the dice.
     */

    public render(div: HTMLElement) {
        ReactDOM.render(
            React.createElement(() => {
                // Store model state in React state
                const [value, setValue] = React.useState<number>(this.getValue());
                // Update React state each time that the model changes
                React.useEffect(() => {
                    this.root.on("valueChanged", () => setValue(this.getValue()));
                });

                // Unicode 0x2680-0x2685 are the sides of a dice (⚀⚁⚂⚃⚄⚅)
                const diceChar = String.fromCodePoint(0x267F + value);
                return (
                    <div>
                        <span style={{ fontSize: 50 }}>{diceChar}</span>
                        <button onClick={this.roll}>Roll</button>
                    </div>
                    );
            }),
            div,
        );
    }

    public getValue = () => {
        return this.root.get(diceValueKey);
    };

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
