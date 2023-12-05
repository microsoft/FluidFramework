/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { ModelContainerRuntimeFactory, getDataStoreEntryPoint } from "@fluid-example/example-utils";
import type { IContainer } from "@fluidframework/container-definitions";
import type { IContainerRuntime } from "@fluidframework/container-runtime-definitions";

import type { IInventoryList, IInventoryListAppModel } from "../modelInterfaces";
import { InventoryListAppModel } from "./appModel";
import { LegacyTreeInventoryListFactory } from "./legacyTreeInventoryList";
import { NewTreeInventoryListFactory } from "./newTreeInventoryList";

export const legacyTreeInventoryListId = "legacy-tree-inventory-list";
export const newTreeInventoryListId = "new-tree-inventory-list";

/**
 * @internal
 */
export class InventoryListContainerRuntimeFactory extends ModelContainerRuntimeFactory<IInventoryListAppModel> {
	public constructor() {
		super(
			new Map([
				LegacyTreeInventoryListFactory.registryEntry,
				NewTreeInventoryListFactory.registryEntry,
			]), // registryEntries
		);
	}

	/**
	 * {@inheritDoc ModelContainerRuntimeFactory.containerInitializingFirstTime}
	 */
	protected async containerInitializingFirstTime(runtime: IContainerRuntime) {
		const legacyTreeInventoryList = await runtime.createDataStore(
			LegacyTreeInventoryListFactory.type,
		);
		await legacyTreeInventoryList.trySetAlias(legacyTreeInventoryListId);
		const newTreeInventoryList = await runtime.createDataStore(
			NewTreeInventoryListFactory.type,
		);
		await newTreeInventoryList.trySetAlias(newTreeInventoryListId);
	}

	/**
	 * {@inheritDoc ModelContainerRuntimeFactory.createModel}
	 */
	protected async createModel(runtime: IContainerRuntime, container: IContainer) {
		const legacyTreeInventoryList = await getDataStoreEntryPoint<IInventoryList>(
			runtime,
			legacyTreeInventoryListId,
		);
		const newTreeInventoryList = await getDataStoreEntryPoint<IInventoryList>(
			runtime,
			newTreeInventoryListId,
		);
		return new InventoryListAppModel(legacyTreeInventoryList, newTreeInventoryList);
	}
}
