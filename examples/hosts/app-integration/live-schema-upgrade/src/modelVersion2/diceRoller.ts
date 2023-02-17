/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { EventEmitter } from "events";
import { assert } from "@fluidframework/common-utils";
import { ISharedCounter, SharedCounter } from "@fluidframework/counter";
import { DataObject, DataObjectFactory } from "@fluidframework/aqueduct";
import { IFluidHandle } from "@fluidframework/core-interfaces";

/**
 * IDiceRoller describes the public API surface for our dice roller data object.
 */
export interface IDiceRoller extends EventEmitter {
	/**
	 * Get the dice value as a number.
	 */
	readonly value: number;

	/**
	 * Gets the number of times the dice has been rolled.
	 */
	readonly count?: number;

	/**
	 * Roll the dice.  Will cause a "diceRolled" event to be emitted.
	 */
	roll: () => void;

	/**
	 * The diceRolled event will fire whenever someone rolls the device, either locally or remotely.
	 */
	on(event: "diceRolled" | "incremented", listener: () => void): this;
}

// The root is map-like, so we'll use this key for storing the value.
const diceValueKey = "diceValue";

// Used for intalizing the SharedCounter DDS.
const sharedCounterKey = "counter";

/**
 * The DiceRoller is our data object that implements the IDiceRoller interface.
 */
export class DiceRoller extends DataObject implements IDiceRoller {
	/**
	 * initializingFirstTime is run only once by the first client to create the DataObject.  Here we use it to
	 * initialize the state of the DataObject.
	 */
	protected async initializingFirstTime() {
		this.root.set(diceValueKey, 1);
	}

	private counter: ISharedCounter | undefined;

	public count: number | undefined;

	/**
	 * hasInitialized is run by each client as they load the DataObject.  Here we use it to set up usage of the
	 * DataObject, by registering an event listener for dice rolls.
	 */
	protected async hasInitialized() {
		this.root.on("valueChanged", (changed) => {
			if (changed.key === diceValueKey) {
				// When we see the dice value change, we'll emit the diceRolled event we specified in our interface.
				this.emit("diceRolled");
			}
		});

		const sharedCounterHandle = this.root.get<IFluidHandle<ISharedCounter>>(sharedCounterKey);
		if (sharedCounterHandle !== undefined) {
			this.counter = await sharedCounterHandle.get();
		} else {
			this.counter = SharedCounter.create(this.runtime, sharedCounterKey);
			this.root.set(sharedCounterKey, this.counter.handle);
		}
		this.count = this.counter.value;

		this.counter.on("incremented", (incrementAmount: number, newValue: number) => {
			// 	console.log(
			// 		`The counter incremented by ${incrementAmount} and now has a value of ${newValue}`,
			// 	);
			// 	this.count = newValue;
			// 	this.emit("incremented");
		});
	}

	public get value() {
		// eslint-disable-next-line @typescript-eslint/no-unsafe-return
		return this.root.get(diceValueKey);
	}

	public readonly roll = () => {
		const rollValue = Math.floor(Math.random() * 6) + 1;
		this.root.set(diceValueKey, rollValue);
		assert(this.counter !== undefined, "Counter should be defined");
		// this.counter.increment(1);
	};
}

/**
 * The DataObjectFactory is used by Fluid Framework to instantiate our DataObject.  We provide it with a unique name
 * and the constructor it will call.  In this scenario, the third and fourth arguments are not used.
 */
export const DiceRollerInstantiationFactory = new DataObjectFactory(
	"dice-roller",
	DiceRoller,
	[SharedCounter.getFactory()],
	{},
);
