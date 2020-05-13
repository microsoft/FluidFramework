/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { EventEmitter } from "events";

import {
    PrimedComponent,
    PrimedComponentFactory,
} from "@microsoft/fluid-aqueduct";
import { IValueChanged } from "@microsoft/fluid-map";
import { IComponentHTMLView } from "@microsoft/fluid-view-interfaces";

import React from "react";
import ReactDOM from "react-dom";

const diceValueKey = "diceValue";

/**
 * IDiceRoller describes the public API surface for our dice roller component.
 */
interface IDiceRoller extends EventEmitter {
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

interface IDiceRollerViewProps {
    model: IDiceRoller;
}

const DiceRollerView: React.FC<IDiceRollerViewProps> = (props: IDiceRollerViewProps) => {
    const [diceValue, setDiceValue] = React.useState(props.model.value);

    React.useEffect(() => {
        const onDiceRolled = () => {
            setDiceValue(props.model.value);
        };
        props.model.on("diceRolled", onDiceRolled);
        return () => {
            props.model.off("diceRolled", onDiceRolled);
        };
    }, [props.model]);

    // Unicode 0x2680-0x2685 are the sides of a dice (⚀⚁⚂⚃⚄⚅)
    const diceChar = String.fromCodePoint(0x267F + diceValue);

    return (
        <div>
            <span style={{ fontSize: 50 }}>{diceChar}</span>
            <button onClick={props.model.roll}>Roll</button>
        </div>
    );
};

/**
 * The DiceRoller is our implementation of the IDiceRoller interface.
 */
export class DiceRoller extends PrimedComponent implements IDiceRoller, IComponentHTMLView {
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
