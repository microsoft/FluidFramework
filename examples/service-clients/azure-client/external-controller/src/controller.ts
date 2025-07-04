/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import events_pkg from "events_pkg";
import { Tree } from "fluid-framework";

import type { Dice } from "./schema.js";

export type DieValue = 1 | 2 | 3 | 4 | 5 | 6;

/**
 * IDiceRoller describes the public API surface for our dice roller data object.
 */
export interface IDiceRollerController extends events_pkg.EventEmitter {
	/**
	 * Get the dice value as a number.
	 */
	readonly value: DieValue;

	/**
	 * Roll the dice.  Will cause a "diceRolled" event to be emitted.
	 */
	roll: () => void;

	/**
	 * The diceRolled event will fire whenever someone rolls the device, either locally or remotely.
	 */
	on(event: "diceRolled", listener: () => void): this;
}

/**
 * The DiceRoller is our data object that implements the IDiceRoller interface.
 */
export class DiceRollerController
	extends events_pkg.EventEmitter
	implements IDiceRollerController
{
	constructor(
		private readonly dice: Dice,
		private readonly onChanged: (value: DieValue) => void,
	) {
		super();
		Tree.on(this.dice, "nodeChanged", () => {
			// When we see the dice value change, we'll emit the diceRolled event we specified in our interface.
			this.emit("diceRolled");
		});
	}

	public get value(): DieValue {
		const value = this.dice.value;
		if (value < 1 || value > 6) {
			throw new RangeError("Model is incorrect - value is out of range");
		}
		return value as DieValue;
	}

	public readonly roll = (): void => {
		const rollValue = (Math.floor(Math.random() * 6) + 1) as DieValue;
		this.dice.value = rollValue;

		// Also notify the caller of the local roll (local value setting).
		this.onChanged(rollValue);
	};
}
