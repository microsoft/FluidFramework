/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { BaseContainerRuntimeFactory } from "@fluidframework/aqueduct";
import { IContainerRuntime } from "@fluidframework/container-runtime-definitions";
import { IFluidDataStoreFactory } from "@fluidframework/runtime-definitions";
import { MountableView } from "@fluidframework/view-adapters";
import { IFluidMountableViewEntryPoint } from "@fluidframework/view-interfaces";

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
		super({
			registryEntries: new Map([[dataStoreFactory.type, Promise.resolve(dataStoreFactory)]]),
			provideEntryPoint: async (
				containerRuntime: IContainerRuntime,
			): Promise<IFluidMountableViewEntryPoint> => {
				const entryPointHandle =
					await containerRuntime.getAliasedDataStoreEntryPoint(dataStoreId);

				if (entryPointHandle === undefined) {
					throw new Error(`Default dataStore [${dataStoreId}] must exist`);
				}

				const entryPoint = await entryPointHandle.get();

				const view = viewCallback(entryPoint as T);
				// eslint-disable-next-line @typescript-eslint/no-unsafe-return
				let getDefaultView = async () => view;
				if (MountableView.canMount(view)) {
					getDefaultView = async () => new MountableView(view);
				}

				return {
					getDefaultDataObject: async () => entryPoint,
					getDefaultView,
					getDefaultMountableView: getDefaultView,
				};
			},
		});
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
