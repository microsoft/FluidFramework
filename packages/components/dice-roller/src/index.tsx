/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import {
    PrimedComponent,
    PrimedComponentFactory,
    SimpleModuleInstantiationFactory,
} from "@microsoft/fluid-aqueduct";
import {
    IComponentHTMLVisual,
} from "@microsoft/fluid-component-core-interfaces";

import * as React from "react";
import * as ReactDOM from "react-dom";

/**
 * Dice roller example using view interfaces and stock component classes.
 */
export class DiceRoller extends PrimedComponent implements IComponentHTMLVisual {
    public get IComponentHTMLVisual() { return this; }

    /**
     * ComponentInitializingFirstTime is where you do setup for your component. This is only called once the first
     * time your component is created. Anything that happens in componentInitializingFirstTime will happen before
     * any other user will see the component.
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
                    <span style={{fontSize: 50}}>{this.getDiceChar(diceValue)}</span>
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
        // tslint:disable-next-line:insecure-random - We don't need secure random numbers for this application.
        const rollValue = Math.floor(Math.random() * 6) + 1;
        this.root.set("diceValue", rollValue);
    }

    private getDiceChar(value: number) {
        // Unicode 0x2680-0x2685 are the sides of a dice (⚀⚁⚂⚃⚄⚅)
        return String.fromCodePoint(0x267F + value);
    }
}

// ----- FACTORY SETUP STUFF -----

/**
 * This is where you define all your Distributed Data Structures
 */
export const DiceRollerInstantiationFactory = new PrimedComponentFactory(
    DiceRoller,
    [],
);

// tslint:disable-next-line: no-var-requires no-require-imports
const pkg = require("../package.json");
const componentName = pkg.name as string;

/**
 * This does setup for the Container. The SimpleModuleInstantiationFactory also enables dynamic loading in the
 * EmbeddedComponentLoader.
 *
 * There are two important things here:
 * 1. Default Component name
 * 2. Map of string to factory for all components
 *
 * In this example, we are only registering a single component, but more complex examples will register multiple
 * components.
 */
export const fluidExport = new SimpleModuleInstantiationFactory(
    componentName,
    new Map([
        [componentName, Promise.resolve(DiceRollerInstantiationFactory)],
    ]),
);
