/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import {
    PrimedComponent,
    PrimedComponentFactory,
} from "@microsoft/fluid-aqueduct";
import { IValueChanged } from "@microsoft/fluid-map";
import { IComponentHTMLView } from "@microsoft/fluid-view-interfaces";

import * as React from "react";
import * as ReactDOM from "react-dom";

const diceValueKey = "diceValue";

interface IDiceRollerViewProps {
    model: DiceRoller;
}

const DiceRollerView: React.FC<IDiceRollerViewProps> = (props: IDiceRollerViewProps) => {
    const [diceValue, setDiceValue] = React.useState(props.model.getDiceValue());

    React.useEffect(() => {
        const onDiceRolled = () => {
            setDiceValue(props.model.getDiceValue());
        };
        props.model.on("diceRolled", onDiceRolled);
        return () => {
            props.model.off("diceRolled", onDiceRolled);
        };
    });

    const getDiceChar = (value: number) => {
        // Unicode 0x2680-0x2685 are the sides of a dice (⚀⚁⚂⚃⚄⚅)
        return String.fromCodePoint(0x267F + value);
    };

    return (
        <div>
            <span style={{ fontSize: 50 }}>{getDiceChar(diceValue)}</span>
            <button onClick={props.model.rollDice}>Roll</button>
        </div>
    );
};

/**
 * Dice roller example using view interfaces and stock component classes.
 */
export class DiceRoller extends PrimedComponent implements IComponentHTMLView {
    public static get ComponentName() { return "@fluid-example/dice-roller"; }

    public get IComponentHTMLView() { return this; }

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

    /**
     * Render the dice.
     */
    public render(div: HTMLElement) {
        ReactDOM.render(
            <DiceRollerView model={ this } />,
            div,
        );
    }

    public readonly rollDice = () => {
        const rollValue = Math.floor(Math.random() * 6) + 1;
        this.root.set(diceValueKey, rollValue);
    };

    public readonly getDiceValue = () => {
        return this.root.get(diceValueKey);
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
