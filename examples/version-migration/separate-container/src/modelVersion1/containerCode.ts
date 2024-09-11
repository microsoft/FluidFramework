/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { getDataStoreEntryPoint } from "@fluid-example/example-utils";
import {
	type IMigratableModel,
	instantiateMigratableRuntime,
	// eslint-disable-next-line import/no-internal-modules
} from "@fluid-example/migration-tools/internal";
import type {
	IContainer,
	IContainerContext,
	IRuntime,
	IRuntimeFactory,
} from "@fluidframework/container-definitions/internal";
import type { IContainerRuntimeOptions } from "@fluidframework/container-runtime/internal";
import type { IContainerRuntime } from "@fluidframework/container-runtime-definitions/internal";

import type { IInventoryList, IInventoryListAppModel } from "../modelInterfaces.js";

import { InventoryListAppModel } from "./appModel.js";
import { InventoryListInstantiationFactory } from "./inventoryList.js";

const inventoryListId = "default-inventory-list";

/**
 * @internal
 */
export class InventoryListContainerRuntimeFactory implements IRuntimeFactory {
	public get IRuntimeFactory(): IRuntimeFactory {
		return this;
	}

	private readonly registryEntries = new Map([
		InventoryListInstantiationFactory.registryEntry,
	]);
	private readonly runtimeOptions: IContainerRuntimeOptions | undefined;
	/**
	 * Constructor for the factory. Supports a test mode which spawns the summarizer instantly.
	 * @param testMode - True to enable instant summarizer spawning.
	 */
	public constructor(testMode: boolean) {
		this.runtimeOptions = testMode
			? {
					summaryOptions: {
						initialSummarizerDelayMs: 0,
					},
				}
			: undefined;
	}

	public async instantiateRuntime(
		context: IContainerContext,
		existing: boolean,
	): Promise<IRuntime> {
		const runtime = await instantiateMigratableRuntime(
			context,
			existing,
			this.registryEntries,
			this.createModel,
			this.runtimeOptions,
		);

		if (!existing) {
			await this.containerInitializingFirstTime(runtime);
		}

		return runtime;
	}

	private readonly containerInitializingFirstTime = async (
		runtime: IContainerRuntime,
	): Promise<void> => {
		const inventoryList = await runtime.createDataStore(
			InventoryListInstantiationFactory.type,
		);
		await inventoryList.trySetAlias(inventoryListId);
	};

	private readonly createModel = async (
		runtime: IContainerRuntime,
		container: IContainer,
	): Promise<IInventoryListAppModel & IMigratableModel> => {
		return new InventoryListAppModel(
			await getDataStoreEntryPoint<IInventoryList>(runtime, inventoryListId),
			container,
		);
	};
}
