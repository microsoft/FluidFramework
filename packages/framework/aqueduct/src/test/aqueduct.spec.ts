/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import type { IValueChanged } from "@fluidframework/map/internal";

import {
	DataObjectFactory,
	// MultiFormatDataStoreFactory,
} from "../data-object-factories/index.js";
import { DataObject } from "../data-objects/index.js";

const diceValueKey = "diceValue";

/**
 * IDiceRoller describes the public API surface for our dice roller Fluid object.
 */
export interface IDiceRoller {
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

/**
 * The DiceRoller is our implementation of the IDiceRoller interface.
 * @internal
 */
export class DiceRoller extends DataObject implements IDiceRoller {
	public static readonly Name = "@fluid-example/dice-roller";

	public static readonly factory = new DataObjectFactory({
		//*		modelDescriptors: [],
		type: DiceRoller.Name,
		ctor: DiceRoller,
	});

	/**
	 * initializingFirstTime is called only once, it is executed only by the first client to open the
	 * Fluid object and all work will resolve before the view is presented to any user.
	 *
	 * This method is used to perform Fluid object setup, which can include setting an initial schema or initial values.
	 */
	protected async initializingFirstTime(): Promise<void> {
		this.root.set(diceValueKey, 1);
	}

	protected async hasInitialized(): Promise<void> {
		this.root.on("valueChanged", (changed: IValueChanged) => {
			if (changed.key === diceValueKey) {
				this.emit("diceRolled");
			}
		});
	}

	public get value(): number {
		return this.root.get(diceValueKey) as number;
	}

	public readonly roll = (): void => {
		const rollValue = Math.floor(Math.random() * 6) + 1;
		this.root.set(diceValueKey, rollValue);
	};
}

/**
 * The DataObjectFactory declares the Fluid object and defines any additional distributed data structures.
 * To add a SharedSequence, SharedMap, or any other structure, put it in the array below.
 * @internal
 */
export const DiceRollerInstantiationFactory = DiceRoller.factory;

// Build pipeline breaks without this file ("No test files found")
describe("aqueduct-placeholder", () => {});
