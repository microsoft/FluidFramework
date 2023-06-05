/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { RepairDataStore } from "./repairDataStore";

/**
 * Manages state required for creating {@link RepairDataStore}s.
 */
export interface IRepairDataStoreProvider<TChange> {
	/**
	 * Freezes the state of this {@link IRepairDataStoreProvider} so that it can
	 * no longer be modified until after the next call to {@link createRepairData}.
	 */
	freeze(): void;
	/**
	 * Applies the provided change to the state of this {@link IRepairDataStoreProvider}.
	 * Does not have an effect if the state has been frozen.
	 */
	applyChange(change: TChange): void;
	/**
	 * Creates and returns a new {@link RepairDataStore}. Also unfreezes this {@link IRepairDataStoreProvider}
	 * if it is currently frozen.
	 */
	createRepairData(): RepairDataStore<TChange>;
	/**
	 * Creates and returns a new {@link IRepairDataStoreProvider} based on this one.
	 */
	clone(): IRepairDataStoreProvider<TChange>;
}
