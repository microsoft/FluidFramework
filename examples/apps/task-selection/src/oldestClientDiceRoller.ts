/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

// Lint rule can be disabled once eslint config is upgraded to 5.3.0+
import { OldestClientObserver } from "@fluid-experimental/oldest-client-observer/legacy";
import { DataObject, DataObjectFactory } from "@fluidframework/aqueduct/legacy";
import { assert } from "@fluidframework/core-utils/legacy";

import { IDiceRoller } from "./interface.js";

// The root is map-like, so we'll use this key for storing the value.
const diceValueKey = "diceValue";

/**
 * The DiceRoller is our data object that implements the IDiceRoller interface.
 */
export class OldestClientDiceRoller extends DataObject implements IDiceRoller {
	private _oldestClientObserver: OldestClientObserver | undefined;
	private autoRollInterval: ReturnType<typeof setInterval> | undefined;

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
		this.root.on("valueChanged", (changed) => {
			if (changed.key === diceValueKey) {
				// When we see the dice value change, we'll emit the diceRolled event we specified in our interface.
				this.emit("diceRolled");
			}
		});

		// We can instantiate an OldestClientObserver using an IFluidDataStoreRuntime.
		this._oldestClientObserver = new OldestClientObserver(this.runtime);

		this.volunteerForAutoRoll();
	}

	private get oldestClientObserver() {
		assert(this._oldestClientObserver !== undefined, "OldestClientObserver not initialized");
		return this._oldestClientObserver;
	}

	public get value() {
		const value = this.root.get<number>(diceValueKey);
		assert(value !== undefined, "Dice value not initialized");
		return value;
	}

	public readonly roll = () => {
		const rollValue = Math.floor(Math.random() * 6) + 1;
		this.root.set(diceValueKey, rollValue);
	};

	public volunteerForAutoRoll() {
		if (this.oldestClientObserver.isOldest()) {
			// If we're oldest, start the autoroll and watch for loss of oldest.
			this.oldestClientObserver.once("lostOldest", () => {
				this.emit("taskOwnershipChanged");
				this.endAutoRollTask();
				this.volunteerForAutoRoll();
			});
			this.emit("taskOwnershipChanged");
			this.startAutoRollTask();
		} else {
			// Otherwise watch to become oldest.
			this.oldestClientObserver.once("becameOldest", () => {
				this.volunteerForAutoRoll();
			});
		}
	}

	private startAutoRollTask() {
		console.log("Starting autoroll from OldestClientDiceRoller");
		if (this.autoRollInterval === undefined) {
			this.autoRollInterval = setInterval(() => {
				this.roll();
			}, 1000);
		}
	}

	private endAutoRollTask() {
		console.log("Ending autoroll from OldestClientDiceRoller");
		if (this.autoRollInterval !== undefined) {
			clearInterval(this.autoRollInterval);
			this.autoRollInterval = undefined;
		}
	}

	public hasTask() {
		return this.oldestClientObserver.isOldest();
	}
}

/**
 * The DataObjectFactory is used by Fluid Framework to instantiate our DataObject.  We provide it with a unique name
 * and the constructor it will call.  In this scenario, the third and fourth arguments are not used.
 */
export const OldestClientDiceRollerInstantiationFactory = new DataObjectFactory(
	"@fluid-example/oldest-client-dice-roller",
	OldestClientDiceRoller,
	[],
	{},
);
