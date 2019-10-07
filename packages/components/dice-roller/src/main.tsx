/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import {
    PrimedComponent,
    PrimedComponentFactory,
} from "@microsoft/fluid-aqueduct";
import {
    IComponentHTMLVisual,
} from "@microsoft/fluid-component-core-interfaces";
import {
    IComponentContext,
    IComponentRuntime,
} from "@microsoft/fluid-runtime-definitions";

import * as React from "react";
import * as ReactDOM from "react-dom";

/**
 * Clicker example using view interfaces and stock component classes.
 */
export class DiceRoller extends PrimedComponent implements IComponentHTMLVisual {
    public get IComponentHTMLVisual() { return this; }

    /**
     * ComponentInitializingFirstTime is where you do setup for your component. This is only called once the first time your component
     * is created. Anything that happens in componentInitializingFirstTime will happen before any other user will see the component.
     */
    protected async componentInitializingFirstTime() {
        this.root.set("diceValue", 1);
    }

    /**
     * Static load function that allows us to make async calls while creating our object.
     * This becomes the standard practice for creating components in the new world.
     * Using a static allows us to have async calls in class creation that you can't have in a constructor
     */
    public static async load(runtime: IComponentRuntime, context: IComponentContext): Promise<DiceRoller> {
        const diceRoller = new DiceRoller(runtime, context);
        await diceRoller.initialize();

        return diceRoller;
    }

    /**
     * Render the dice.
     */
    public render(div: HTMLElement) {
        const rerender = () => {
            // Get our dice value stored in the root.
            const diceValue = this.root.get("diceValue");

            ReactDOM.render(
                <div>
                    <span style={{fontSize: 50}}>{this.getDiceChar(diceValue)}</span>
                    <button onClick={this.rollDice.bind(this)}>Roll</button>
                </div>,
                div
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
 * This is where you define all your Distributed Data Structures and Value Types
 */
export const DiceRollerInstantiationFactory = new PrimedComponentFactory(
    DiceRoller,
    [],
);
