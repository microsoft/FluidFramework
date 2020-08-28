import {
    DataObject,
    DataObjectFactory,
} from "@fluidframework/aqueduct";
import { IValueChanged } from "@fluidframework/map";
import { IFluidHTMLView } from "@fluidframework/view-interfaces";

import * as React from "react";
import * as ReactDOM from "react-dom";

import { IDiceRoller } from "./interface";
import { DiceRollerView } from "./view";

const diceValueKey = "diceValue";

/**
 * Fluid DataObject
 */
export class DiceRoller extends DataObject implements IDiceRoller, IFluidHTMLView {
    public static get DataObjectName() { return "dice-roller"; }

    public get IFluidHTMLView() { return this; }

    /**
     * The factory defines how to create an instance of the DataObject as well as the
     * dependencies of the DataObject.
     */
    public static readonly factory = new DataObjectFactory(
        DiceRoller.DataObjectName,
        DiceRoller,
        [],
        {},
    );

    /**
     * initializingFirstTime is called only once, it is executed only by the first client to open the
     * DataObject and all work will resolve before the view is presented to any user.
     *
     * This method is used to perform DataObject setup, which can include setting an initial schema or initial values.
     */
    protected async initializingFirstTime() {
        this.root.set(diceValueKey, 1);
    }

    /**
     * hasInitialized runs every time the DataObject is initialized including the first time.
     */
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
