/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

// TODO: Note that this would theoretically come from some model loading package, not migration-tools.
// Maybe move back into example-utils for the short-term
import type { IEntryPointPiece } from "@fluid-example/migration-tools/internal";
import type { IContainer } from "@fluidframework/container-definitions/internal";
import type { IContainerRuntime } from "@fluidframework/container-runtime-definitions/internal";
import type { FluidObject } from "@fluidframework/core-interfaces";

import type { IInventoryList } from "../modelInterfaces.js";

import { InventoryListAppModel } from "./appModel.js";
import { InventoryListInstantiationFactory } from "./inventoryList.js";

const modelEntryPointPieceName = "getModel";

const inventoryListAlias = "default-inventory-list";

async function getDataStoreEntryPoint(
	runtime: IContainerRuntime,
	alias: string,
): Promise<FluidObject> {
	const entryPointHandle = await runtime.getAliasedDataStoreEntryPoint(alias);

	if (entryPointHandle === undefined) {
		throw new Error(`Default dataStore [${alias}] must exist`);
	}

	return entryPointHandle.get();
}

const createPiece = async (
	runtime: IContainerRuntime,
): Promise<(container: IContainer) => Promise<FluidObject>> => {
	return async (container: IContainer) =>
		new InventoryListAppModel(
			(await getDataStoreEntryPoint(runtime, inventoryListAlias)) as IInventoryList,
			container,
		);
};

export const modelEntryPointPiece: IEntryPointPiece = {
	name: modelEntryPointPieceName,
	registryEntries: [InventoryListInstantiationFactory.registryEntry],
	onCreate: async (runtime: IContainerRuntime): Promise<void> => {
		const inventoryList = await runtime.createDataStore(
			InventoryListInstantiationFactory.type,
		);
		await inventoryList.trySetAlias(inventoryListAlias);
	},
	onLoad: async (runtime: IContainerRuntime): Promise<void> => {},
	createPiece,
};
