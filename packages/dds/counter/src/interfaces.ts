/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { type ISharedObject, type ISharedObjectEvents } from "@fluidframework/shared-object-base";

/**
 * Events sent by {@link SharedCounter}.
 * @alpha
 */
export interface ISharedCounterEvents extends ISharedObjectEvents {
	/**
	 * This event is raised when the counter is incremented or decremented.
	 *
	 * @param event - The event name.
	 * @param listener - An event listener.
	 *
	 * @eventProperty
	 */
	(event: "incremented", listener: (incrementAmount: number, newValue: number) => void);
}

/**
 * A shared object that holds a number that can be incremented or decremented.
 *
 * @remarks Note that `SharedCounter` only operates on integer values. This is validated at runtime.
 *
 * @example Creating a `SharedCounter`
 *
 * First, get the factory and call {@link @fluidframework/datastore-definitions#IChannelFactory.create}
 * with a runtime and string ID:
 *
 * ```typescript
 * const factory = SharedCounter.getFactory();
 * const counter = factory.create(this.runtime, id) as SharedCounter;
 * ```
 *
 * The initial value of a new `SharedCounter` is 0.
 * If you wish to initialize the counter to a different value, you may call {@link SharedCounter.increment} before
 * attaching the Container, or before inserting it into an existing shared object.
 *
 * @example Using the `SharedCounter`
 *
 * Once created, you can call {@link SharedCounter.increment} to modify the value with either a positive or
 * negative number:
 *
 * ```typescript
 * counter.increment(10); // add 10 to the counter value
 * counter.increment(-5); // subtract 5 from the counter value
 * ```
 *
 * To observe changes to the value (including those from remote clients), register for the
 * {@link ISharedCounterEvents | incremented} event:
 *
 * ```typescript
 * counter.on("incremented", (incrementAmount, newValue) => {
 *     console.log(`The counter incremented by ${incrementAmount} and now has a value of ${newValue}`);
 * });
 * ```
 * @alpha
 */
export interface ISharedCounter extends ISharedObject<ISharedCounterEvents> {
	/**
	 * The counter value.
	 *
	 * @remarks Must be a whole number.
	 */
	value: number;

	/**
	 * Increments or decrements the value.
	 * Must only increment or decrement by a whole number value.
	 *
	 * @param incrementAmount - A whole number to increment or decrement by.
	 */
	increment(incrementAmount: number): void;
}
