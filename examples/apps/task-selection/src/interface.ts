/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import type { EventEmitter } from "@fluid-example/example-utils";

/**
 * IDiceRoller describes the public API surface for our dice roller data object.
 */
export interface IDiceRoller extends EventEmitter {
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
	on(event: "diceRolled" | "taskOwnershipChanged", listener: () => void): this;

	/**
	 * Exposing this just so we can provide some visual feedback in the view.
	 */
	hasTask(): boolean;
}
