/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import {
	ModelContainerRuntimeFactory,
	getDataStoreEntryPoint,
} from "@fluid-example/example-utils";
import type { IContainer } from "@fluidframework/container-definitions/legacy";
import type { IContainerRuntime } from "@fluidframework/container-runtime-definitions/legacy";

import type { IInventoryList, IInventoryListAppModel } from "../modelInterfaces.js";

import { InventoryListAppModel } from "./appModel.js";
import {
	LegacyTreeInventoryListFactory,
	LegacyTreeInventoryListFactoryNew,
} from "./legacyTreeInventoryList.js";

export const legacyTreeInventoryListId = "legacy-tree-inventory-list";

/**
 * @internal
 */
export class InventoryListContainerRuntimeFactory extends ModelContainerRuntimeFactory<IInventoryListAppModel> {
	public constructor(useNew: boolean = false) {
		super(
			new Map([
				useNew
					? LegacyTreeInventoryListFactoryNew.registryEntry
					: LegacyTreeInventoryListFactory.registryEntry,
			]), // registryEntries
			{
				enableRuntimeIdCompressor: "on",
				summaryOptions: { summaryConfigOverrides: { state: "disabled" } },
			},
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
	}

	/**
	 * {@inheritDoc ModelContainerRuntimeFactory.createModel}
	 */
	protected async createModel(runtime: IContainerRuntime, container: IContainer) {
		const legacyTreeInventoryList = await getDataStoreEntryPoint<IInventoryList>(
			runtime,
			legacyTreeInventoryListId,
		);
		return new InventoryListAppModel(legacyTreeInventoryList);
	}
}
