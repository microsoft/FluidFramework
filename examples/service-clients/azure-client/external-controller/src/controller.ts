/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { IValueChanged } from "@fluidframework/map/internal";
import events_pkg from "events_pkg";

/**
 * IDiceRoller describes the public API surface for our dice roller data object.
 */
export interface IDiceRollerController extends events_pkg.EventEmitter {
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

export interface DiceRollerControllerProps {
	get: (key: string) => unknown;
	set: (key: string, value: unknown) => void;
	on(event: "valueChanged", listener: (args: IValueChanged) => void): this;
	off(event: "valueChanged", listener: (args: IValueChanged) => void): this;
}

/**
 * The DiceRoller is our data object that implements the IDiceRoller interface.
 */
export class DiceRollerController extends events_pkg.EventEmitter implements IDiceRollerController {
	/**
	 * Initialize a new model for its first use with this controller.
	 * The model must be initialized before trying to use it in a DiceRollerController instance.
	 */
	public static initializeModel(props: DiceRollerControllerProps): void {
		props.set(diceValueKey, 1);
	}

	constructor(private readonly props: DiceRollerControllerProps) {
		super();
		const value = this.props.get(diceValueKey);
		if (typeof value !== "number") {
			throw new TypeError(
				"Model is incorrect - did you call DiceRollerController.initializeModel() to set it up?",
			);
		}
		this.props.on("valueChanged", (changed) => {
			if (changed.key === diceValueKey) {
				// When we see the dice value change, we'll emit the diceRolled event we specified in our interface.
				this.emit("diceRolled");
			}
		});
	}

	public get value(): number {
		const value = this.props.get(diceValueKey);
		if (typeof value !== "number") {
			throw new TypeError(
				"Model is incorrect - did you call DiceRollerController.initializeModel() to set it up?",
			);
		}
		return value;
	}

	public readonly roll = (): void => {
		const rollValue = Math.floor(Math.random() * 6) + 1;
		this.props.set(diceValueKey, rollValue);
	};
}
