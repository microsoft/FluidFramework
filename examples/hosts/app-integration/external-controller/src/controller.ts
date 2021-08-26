/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { EventEmitter } from "events";
import { IDirectoryValueChanged } from "fluid-framework";

/**
 * IDiceRoller describes the public API surface for our dice roller data object.
 */
export interface IDiceRollerController extends EventEmitter {
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

// The data is stored in a key-value pair data object, so we'll use this key for storing the value.
const diceValueKey = "diceValue";

interface DiceRollerControllerProps {
    get: (key: string) => any;
    set: (key: string, value: any) => void;
    on(event: "changed" | "valueChanged", listener: (args: IDirectoryValueChanged) => void): this;
    off(event: "changed" | "valueChanged", listener: (args: IDirectoryValueChanged) => void): this;
}

/**
 * The DiceRoller is our data object that implements the IDiceRoller interface.
 */
export class DiceRollerController extends EventEmitter implements IDiceRollerController {
    constructor(private readonly props: DiceRollerControllerProps) {
        super();
        this.props.on("changed", (changed) => {
            if (changed.key === diceValueKey) {
                // When we see the dice value change, we'll emit the diceRolled event we specified in our interface.
                this.emit("diceRolled");
            }
        });
        this.props.on("valueChanged", (changed) => {
            if (changed.key === diceValueKey) {
                // When we see the dice value change, we'll emit the diceRolled event we specified in our interface.
                this.emit("diceRolled");
            }
        });
    }

    /**
     * When we create the dice roller for the first time (with respect to the document's lifetime), we need to
     * initialize its value. This should only be called once over the document's lifetime.
     */
    private initializeFirstTime(): void {
        this.props.set(diceValueKey, 1);
    }

    private async initializeFromExisting(): Promise<void> {
        // If the value is already there, we are initialized enough.
        if (this.props.get(diceValueKey) !== undefined) {
            return;
        }

        // Otherwise, we expect the value will be set by the client that is creating the dice roller.
        // The set should be on the way, in the pending ops.
        return new Promise((resolve) => {
            const resolveIfKeySet = () => {
                if (this.props.get(diceValueKey) !== undefined) {
                    resolve();
                    this.props.off("changed", resolveIfKeySet);
                    this.props.off("valueChanged", resolveIfKeySet);
                }
            };
            this.props.on("changed", resolveIfKeySet);
            this.props.on("valueChanged", resolveIfKeySet);
        });
    }

    public async initialize(firstTime: boolean): Promise<void> {
        if (firstTime) {
            this.initializeFirstTime();
        } else {
            return this.initializeFromExisting();
        }
    }

    public get value() {
        // eslint-disable-next-line @typescript-eslint/no-unsafe-return
        return this.props.get(diceValueKey);
    }

    public readonly roll = () => {
        const rollValue = Math.floor(Math.random() * 6) + 1;
        this.props.set(diceValueKey, rollValue);
    };
}
