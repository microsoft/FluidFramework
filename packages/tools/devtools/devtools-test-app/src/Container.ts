/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { ModelContainerRuntimeFactory } from "@fluid-example/example-utils";
import type { IContainer } from "@fluidframework/container-definitions/internal";
import type { IContainerRuntime } from "@fluidframework/container-runtime-definitions/internal";
import type { IFluidHandle } from "@fluidframework/core-interfaces";
import type { IDevtoolsLogger, IFluidDevtools } from "@fluidframework/devtools-core/internal";

import { AppData } from "./FluidObject.js";

/**
 * This model contains the data we want to share with other clients.
 */
export interface IAppModel {
	readonly appData: AppData;
	readonly container: IContainer;
}

class AppModel implements IAppModel {
	public constructor(
		public readonly appData: AppData,
		public readonly container: IContainer,
	) {}
}

const collaborativeObjId = "collaborative-obj";

/**
 * The runtime factory for the app.
 */
export class RuntimeFactory extends ModelContainerRuntimeFactory<IAppModel> {
	private readonly logger?: IDevtoolsLogger;
	private readonly devtools?: IFluidDevtools;

	public constructor(logger?: IDevtoolsLogger, devtools?: IFluidDevtools) {
		super(
			new Map([AppData.getFactory().registryEntry]), // registryEntries
			{
				enableRuntimeIdCompressor: "on",
			},
		);
		this.logger = logger;
		this.devtools = devtools;
	}

	/**
	 * {@inheritDoc ModelContainerRuntimeFactory.containerInitializingFirstTime}
	 */
	protected async containerInitializingFirstTime(runtime: IContainerRuntime): Promise<void> {
		const dataStore = await runtime.createDataStore(AppData.getFactory().type);
		await dataStore.trySetAlias(collaborativeObjId);
	}

	/**
	 * {@inheritDoc ModelContainerRuntimeFactory.createModel}
	 */
	protected async createModel(
		runtime: IContainerRuntime,
		container: IContainer,
	): Promise<IAppModel> {
		const entryPointHandle = (await runtime.getAliasedDataStoreEntryPoint(
			collaborativeObjId,
		)) as IFluidHandle<AppData> | undefined;

		if (entryPointHandle === undefined) {
			throw new Error(`Default dataStore [${collaborativeObjId}] must exist`);
		}

		const appData = await entryPointHandle.get();

		if (this.devtools && this.logger) {
			appData.setDevtools(this.devtools, this.logger);
		}

		return new AppModel(appData, container);
	}
}
