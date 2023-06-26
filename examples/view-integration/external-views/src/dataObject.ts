/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { EventEmitter } from "events";
import { DataObject, DataObjectFactory } from "@fluidframework/aqueduct";

/**
 * IDiceRoller describes the public API surface for our dice roller data object.
 */
export interface IDiceRoller extends EventEmitter {
	/**
	 * Get the dice value as a number.
	 */
	readonly value: number;

	/**
	 * Get's the last sequence number for this DiceRoller.
	 */
	readonly lastSequenceNumber: number;

	/**
	 * Roll the dice.  Will cause a "diceRolled" event to be emitted.
	 */
	roll: () => void;

	/**
	 * The diceRolled event will fire whenever someone rolls the device, either locally or remotely.
	 */
	on(event: "diceRolled", listener: () => void): this;

	/**
	 * The export event will fire whenever someone clicks the export button for the first time.
	 */
	on(event: "export", listener: (lastSequenceNumber: number) => void): this;

	/**
	 * Initiates the frozen container load to export data.
	 */
	export: () => void;
}

// The root is map-like, so we'll use this key for storing the value.
const diceValueKey = "diceValue";
const lastSeqNumKey = "lastSequenceNumber";

/**
 * The DiceRoller is our data object that implements the IDiceRoller interface.
 */
export class DiceRoller extends DataObject implements IDiceRoller {
	/**
	 * Used to track lastSequenceNumber we agree to load the export container up to.
	 */
	private exportSequenceNumber: number | undefined;

	public get lastSequenceNumber() {
		// In a production scenario this infromation will normally live on the MigrationTool. However, for this POC
		// we access it here for convenience.
		return this.runtime.deltaManager.lastSequenceNumber;
	}

	/**
	 * initializingFirstTime is run only once by the first client to create the DataObject.  Here we use it to
	 * initialize the state of the DataObject.
	 */
	protected async initializingFirstTime() {
		this.root.set(diceValueKey, 1);
	}

	/**
	 * hasInitialized is run by each client as they load the DataObject.  Here we use it to set up usage of the
	 * DataObject, by registering an event listener for dice rolls.
	 */
	protected async hasInitialized() {
		this.exportSequenceNumber = this.root.get(lastSeqNumKey);

		this.root.on("valueChanged", (changed) => {
			if (changed.key === diceValueKey) {
				// When we see the dice value change, we'll emit the diceRolled event we specified in our interface.
				this.emit("diceRolled");
			}
			if (changed.key === lastSeqNumKey) {
				this.exportSequenceNumber = this.root.get(lastSeqNumKey);
				console.log("Agreed to migrate at seq #:", this.exportSequenceNumber);
				this.emit("export", this.exportSequenceNumber);
			}
		});
	}

	public get value() {
		// eslint-disable-next-line @typescript-eslint/no-unsafe-return
		return this.root.get(diceValueKey);
	}

	public readonly roll = () => {
		const rollValue = Math.floor(Math.random() * 6) + 1;
		this.root.set(diceValueKey, rollValue);
	};

	// Note: In a production scenario this would likely be triggered by a PactMap agreement on the MigrationTool
	// when migration has the least risk of user disruption. For the convenience of this POC, we manually trigger the
	// export flow by clicking a button.
	public readonly export = () => {
		// Only set if not already set
		if (this.exportSequenceNumber === undefined) {
			this.root.set(lastSeqNumKey, this.lastSequenceNumber);
		} else {
			console.log("Migration already agreed to at seq #:", this.exportSequenceNumber);
			this.emit("export", this.exportSequenceNumber);
		}
	};
}

/**
 * The DataObjectFactory is used by Fluid Framework to instantiate our DataObject.  We provide it with a unique name
 * and the constructor it will call.  In this scenario, the third and fourth arguments are not used.
 */
export const DiceRollerInstantiationFactory = new DataObjectFactory(
	"dice-roller",
	DiceRoller,
	[],
	{},
);
