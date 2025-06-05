/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import type { IEvent, IEventProvider } from "@fluidframework/core-interfaces";

/**
 * IDiceRollerEvents describes the events for an IDiceRoller.
 */
export interface IDiceRollerEvents extends IEvent {
	(event: "diceRolled", listener: () => void);
}

/**
 * IDiceRoller describes the public API surface for our dice roller data object.
 */
export interface IDiceRoller {
	/**
	 * Object that events for changes to the dice value.
	 */
	readonly events: IEventProvider<IDiceRollerEvents>;

	/**
	 * Get the dice value as a number.
	 */
	readonly value: number;

	/**
	 * Roll the dice.  Will cause a "diceRolled" event to be emitted.
	 */
	roll: () => void;
}
