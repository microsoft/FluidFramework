/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { BaseContainerRuntimeFactory } from "@fluidframework/aqueduct";
import { IContainerRuntime } from "@fluidframework/container-runtime-definitions";
import {
	IFluidDataStoreChannel,
	IFluidDataStoreFactory,
} from "@fluidframework/runtime-definitions";
import { MountableView } from "@fluidframework/view-adapters";

const dataStoreId = "modelDataStore";

export type ViewCallback<T> = (fluidModel: T) => any;

/**
 * The ContainerViewRuntimeFactory is an example utility built to support binding a single model to a single view
 * within the container.  For more-robust implementation of binding views within the container, check out the examples
 * \@fluid-example/app-integration-container-views and \@fluid-example/multiview-container
 */
export class ContainerViewRuntimeFactory<T> extends BaseContainerRuntimeFactory {
	constructor(
		private readonly dataStoreFactory: IFluidDataStoreFactory,
		viewCallback: ViewCallback<T>,
	) {
		// We'll use a MountableView so webpack-fluid-loader can display us,
		// and add our default view request handler.
		super(
			new Map([[dataStoreFactory.type, Promise.resolve(dataStoreFactory)]]),
			undefined,
			undefined,
			undefined,
			async (containerRuntime: IContainerRuntime) => {
				// ISSUE: IContainerRuntime doesn't have methods that expose data stores as IDataStore or
				// IFluidDataStoreChannel, which expose entryPoint. getRootDataStore returns an IFluidRouter.
				const dataStore: IFluidDataStoreChannel = (await containerRuntime.getRootDataStore(
					dataStoreId,
				)) as IFluidDataStoreChannel;

				// TODO: better type discovery
				const fluidObject: T = (await dataStore.entryPoint?.get()) as T;
				if (fluidObject === undefined) {
					throw new Error("DataStore did not set its EntryPoint");
				}

				return new MountableView(viewCallback(fluidObject));
			} /* initializeEntryPoint */,
		);
	}

	/**
	 * Since we're letting the container define the default view it will respond with, it must do whatever setup
	 * it requires to produce that default view.  We'll create a single data store of the specified type.
	 */
	protected async containerInitializingFirstTime(runtime: IContainerRuntime) {
		const dataStore = await runtime.createDataStore(this.dataStoreFactory.type);
		await dataStore.trySetAlias(dataStoreId);
	}
}
