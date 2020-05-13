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

class DiceRollerView implements IComponentHTMLView {
    constructor(private readonly model: IDiceRoller) { }

    public get IComponentHTMLView() { return this; }

    public render(div: HTMLElement) {
        const diceSpan = document.createElement("span");
        diceSpan.classList.add("diceSpan");
        diceSpan.style.fontSize = "50px";
        diceSpan.textContent = this.getDiceChar(this.model.value);
        div.appendChild(diceSpan);

        const rollButton = document.createElement("button");
        rollButton.classList.add("rollButton");
        rollButton.textContent = "Roll";
        rollButton.onclick = this.model.roll;
        div.appendChild(rollButton);

        // When the value of the dice changes we will re-render the
        // value in the dice span
        this.model.on("diceRolled", () => {
            diceSpan.textContent = this.getDiceChar(this.model.value);
        });
    }

    private getDiceChar(value: number) {
        // Unicode 0x2680-0x2685 are the sides of a dice (⚀⚁⚂⚃⚄⚅)
        return String.fromCodePoint(0x267F + value);
    }
}

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
        const view = new DiceRollerView(this);
        view.render(div);
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
