/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import {
    PrimedComponent,
    PrimedComponentFactory,
} from "@microsoft/fluid-aqueduct";
import {
    IComponentHTMLView,
} from "@microsoft/fluid-component-core-interfaces";

import * as React from "react";
import * as ReactDOM from "react-dom";

/**
 * Dice roller example using view interfaces and stock component classes.
 */
export class DiceRoller extends PrimedComponent implements IComponentHTMLView {
    public get IComponentHTMLView() { return this; }

    /**
     * ComponentInitializingFirstTime is called only once, it is executed only by the first client to open the
     * component and all work will resolve before the view is presented to any user.
     *
     * This method is used to perform component setup, which can include setting an initial schema or initial values.
     */
    protected async componentInitializingFirstTime() {
        this.root.set("diceValue", 1);
    }

    /**
     * Render the dice.
     */
    public render(div: HTMLElement) {
        const rerender = () => {
            // Get our dice value stored in the root.
            const diceValue = this.root.get<number>("diceValue");

            ReactDOM.render(
                <div>
                    <span style={{ fontSize: 50 }}>{this.getDiceChar(diceValue)}</span>
                    <button onClick={this.rollDice.bind(this)}>Roll</button>
                </div>,
                div,
            );
        };

        rerender();
        this.root.on("valueChanged", () => {
            rerender();
        });
    }

    private rollDice() {
        const rollValue = Math.floor(Math.random() * 6) + 1;
        this.root.set("diceValue", rollValue);
    }

    private getDiceChar(value: number) {
        // Unicode 0x2680-0x2685 are the sides of a dice (⚀⚁⚂⚃⚄⚅)
        return String.fromCodePoint(0x267F + value);
    }
}

/**
 * The PrimedComponentFactory declares the component and defines any additional distributed data structures.
 * To add a SharedSequence, SharedMap, or any other structure, put it in the array below.
 */
export const DiceRollerInstantiationFactory = new PrimedComponentFactory(
    DiceRoller,
    [],
);
