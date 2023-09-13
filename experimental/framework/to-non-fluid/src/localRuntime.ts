/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { assert } from "@fluidframework/core-utils";
import { LocalDataStore } from "./localDataStore";

export class LocalRuntime {
	constructor(public readonly sequenceNumber: number) {}

	public readonly dataStores: Map<string, LocalDataStore> = new Map();

	public add(dataStore: LocalDataStore) {
		assert(!this.dataStores.has(dataStore.id), "dataStore already exists!");
		this.dataStores.set(dataStore.id, dataStore);
	}

	public get(id: string): LocalDataStore {
		const dataStore = this.dataStores.get(id);
		assert(dataStore !== undefined, "dataStore should exist");
		return dataStore;
	}
}
