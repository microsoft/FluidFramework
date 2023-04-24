/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { RepairDataStore } from "../repair";

/**
 * Manages state required for creating {@link RepairDataStore}s.
 */
export interface IRepairDataStoreProvider {
	/**
	 * Freezes the state of this {@link IRepairDataStoreProvider} so that it can
	 * no longer be modified until after the next call to {@link createRepairData}.
	 */
	freeze(): void;
	/**
	 * Creates and returns a new {@link RepairDataStore}. Also unfreezes this {@link IRepairDataStoreProvider}
	 * if it is currently frozen.
	 */
	createRepairData(): RepairDataStore;
	/**
	 * Creates and returns a new {@link IRepairDataStoreProvider} with the same state as this one.
	 */
	clone(): IRepairDataStoreProvider;
}
