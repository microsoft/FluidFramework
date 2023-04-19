/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { writable, type Writable } from "svelte/store";
import type { SharedMap } from "@fluidframework/map";
import type { IFluidContainer } from "fluid-framework";

/**
 * FluidStore is a Svelte store implementation that synchronizes its state with a Fluid SharedMap object.
 * Whenever the Fluid SharedMap is updated, the FluidStore updates the internal Svelte store
 * with the new value. Due to design limitations, it can only work with a single value and
 * a SharedMap with the key "root" in initialObjects.
 *
 * @class FluidStore<T>
 * @implements {Writable<T>}
 */
class FluidStore<T> implements Writable<T> {
	private readonly internalStore: Writable<T>;
	private readonly fluidMap: SharedMap;
	private static readonly KEY_CONST = "value";

	/**
	 * Creates an instance of FluidStore and initializes it with the given FluidContainer and
	 * an optional initial value.
	 *
	 * @constructor
	 * @param {IFluidContainer} container - A Fluid container instance to connect the store with.
	 * @param {T} [initialValue] - The optional initial value for the Svelte store.
	 */
	constructor(container: IFluidContainer, initialValue?: T) {
		this.fluidMap = container.initialObjects.root as SharedMap;

		this.internalStore = writable(initialValue);

		this.fluidMap.on("valueChanged", (changed: { key: string; value: T }) => {
			if (changed.key === FluidStore.KEY_CONST) {
				this.internalStore.set(changed.value);
			}
		});
	}

	/**
	 * Sets the value of the store.
	 * @param {T} value - The new value to set.
	 */
	set(value: T): void {
		this.fluidMap.set(FluidStore.KEY_CONST, value);
		this.internalStore.set(value);
	}

	/**
	 * Updates the value of the store using an updater function.
	 * @param {(value: T) => T} updater - A function that accepts the current value and returns an updated value.
	 */
	update(updater: (value: T) => T): void {
		this.internalStore.update((currentValue) => {
			const newValue: T = updater(currentValue);
			this.fluidMap.set(FluidStore.KEY_CONST, newValue);
			return newValue;
		});
	}

	/**
	 * Subscribes to the store, runs the provided callback function
	 * whenever the store value changes.
	 * @param {(value: T) => void} subscriber - A callback function that runs whenever the store value changes.
	 * @returns {() => void} - Returns an unsubscribe function.
	 */
	subscribe(subscriber: (value: T) => void): () => void {
		return this.internalStore.subscribe(subscriber);
	}
}

/**
 * fluidWritable is a helper function that creates a new instance of the FluidStore.
 * The FluidStore class represents a Svelte store that synchronizes its state with a
 * Fluid SharedMap object. Due to design limitations, it can only work with a single value and
 * a SharedMap with the key "root" in initialObjects.
 *
 * @function fluidWritable
 * @param {IFluidContainer} container - A Fluid container instance to connect the store with.
 * @param {T} [initialValue] - The optional initial value for the Svelte store.
 * @returns {FluidStore<T>} - A new instance of the FluidStore class.
 * @template T - The type of the value stored in the FluidStore.
 */
export function fluidWritable<T>(container: IFluidContainer, initialValue?: T): FluidStore<T> {
	return new FluidStore<T>(container, initialValue);
}
