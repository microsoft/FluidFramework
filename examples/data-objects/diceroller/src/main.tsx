/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { EventEmitter } from "events";
import {
    DataObject,
    DataObjectFactory,
} from "@fluidframework/aqueduct";
import { IValueChanged } from "@fluidframework/map";
import { IFluidHTMLView } from "@fluidframework/view-interfaces";
import React from "react";
import ReactDOM from "react-dom";

const diceValueKey = "diceValue";

/**
 * IDiceRoller describes the public API surface for our dice roller Fluid object.
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
export class DiceRoller extends DataObject implements IDiceRoller, IFluidHTMLView {
    public static get Name() { return "@fluid-example/dice-roller"; }

    public get IFluidHTMLView() { return this; }

    public static readonly factory = new DataObjectFactory
    (
        DiceRoller.Name,
        DiceRoller,
        [],
        {},
    );
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
            <DiceRollerView model={this} />,
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
export const DiceRollerInstantiationFactory = DiceRoller.factory;
