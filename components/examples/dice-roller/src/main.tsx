/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import {
    PrimedComponent,
    PrimedComponentFactory
} from "@fluidframework/aqueduct";
import { IValueChanged } from "@fluidframework/map";
import { IComponentHTMLView } from "@fluidframework/view-interfaces";

import React from "react";
import ReactDOM from "react-dom";

const diceValueKey = "diceValue";

/**
 * IDiceRoller describes the public API surface for our dice roller component.
 */
interface IDiceRollerViewProps {
    /**
     * The current value of the dice as a number
     */
    value: number;

    /**
     * Callback to roll the dice
     */
    roll: () => void;
}

interface IDiceRollerModelProps extends PrimedComponent{
    /**
     * Get the dice value from the model as a number.
     */
    getValue: () => number;

    /**
     * Update the model to have a new dice value
     */
    roll: () => void;
}

const DiceRollerView: React.FC<IDiceRollerViewProps> = (props: IDiceRollerViewProps) => {
    // Unicode 0x2680-0x2685 are the sides of a dice (⚀⚁⚂⚃⚄⚅)
    const diceChar = String.fromCodePoint(0x267f + props.value);

    return (
        <div>
            <span style={{ fontSize: 50 }}>{diceChar}</span>
            <button onClick={props.roll}>Roll</button>
        </div>
    );
};

/**
 * FluidReactClient is in charge of maintaining the React application state and updating app state on model change.
 * This component allows the view to be unaware of the model and keeps app rendering/rerendering within React.
 */
const FluidReactClient = ({ model }: {model: IDiceRollerModelProps}): JSX.Element => {
    const [value, setValue] = React.useState(model.getValue());
    const updateValue = () => setValue(model.getValue());
    React.useEffect(() => {
        model.on("diceRolled", updateValue);
        return () => {
            model.off("diceRolled", updateValue);
        };
    }, [model]);
    return <DiceRollerView value={value} roll={model.roll} />;
};

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
            React.createElement(FluidReactClient, { model: this }),
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
