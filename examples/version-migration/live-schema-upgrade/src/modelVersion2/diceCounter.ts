/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import type { EventEmitter } from "@fluid-example/example-utils";
import { assert } from "@fluidframework/core-utils";
import { ISharedCounter, SharedCounter } from "@fluidframework/counter";
import { DataObject, DataObjectFactory } from "@fluidframework/aqueduct";
import { IFluidHandle } from "@fluidframework/core-interfaces";

/**
 * IDiceCounter describes the public API surface for our dice counter data object.
 */
export interface IDiceCounter extends EventEmitter {
	/**
	 * Gets the number of times the dice has been rolled as a number.
	 */
	readonly count: number;

	/**
	 * Increment the counter.  Will cause a "incremented" event to be emitted.
	 */
	increment: () => void;

	/**
	 * The incremented event will fire whenever someone rolls the device, either locally or remotely.
	 */
	on(event: "incremented", listener: () => void): this;
}

// Used for initializing the SharedCounter DDS.
const sharedCounterKey = "counter";

/**
 * The DiceCounter is our data object that implements the IDiceCounter interface.
 */
export class DiceCounter extends DataObject implements IDiceCounter {
	private _counter: ISharedCounter | undefined;
	public count: number = 0;

	/**
	 * initializingFirstTime is run only once by the first client to create the DataObject.  Here we use it to
	 * initialize the state of the DataObject.
	 */
	protected async initializingFirstTime() {
		this._counter = SharedCounter.create(this.runtime, sharedCounterKey);
		this.root.set(sharedCounterKey, this._counter.handle);
	}

	/**
	 * hasInitialized is run by each client as they load the DataObject.  Here we use it to set up usage of the
	 * DataObject, by registering an event listener for dice rolls.
	 */
	protected async hasInitialized() {
		if (this._counter === undefined) {
			// Get the existing counter if we didn't initialize it.
			const sharedCounterHandle =
				this.root.get<IFluidHandle<ISharedCounter>>(sharedCounterKey);
			assert(sharedCounterHandle !== undefined, "sharedCounterHandle should be defined");
			this._counter = await sharedCounterHandle.get();
			// Ensure the count is up to date when we load.
			this.count = this._counter.value;
		}

		this._counter.on("incremented", (incrementAmount: number, newValue: number) => {
			this.count = newValue;
			this.emit("incremented");
		});
	}

	public readonly increment = () => {
		assert(this._counter !== undefined, "this._counter should be defined");
		this._counter.increment(1);
	};
}

/**
 * The DataObjectFactory is used by Fluid Framework to instantiate our DataObject.  We provide it with a unique name
 * and the constructor it will call.  In this scenario, the third and fourth arguments are not used.
 */
export const DiceCounterInstantiationFactory = new DataObjectFactory(
	"dice-counter",
	DiceCounter,
	[SharedCounter.getFactory()],
	{},
);
