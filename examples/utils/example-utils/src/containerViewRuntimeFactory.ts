/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { BaseContainerRuntimeFactory } from "@fluidframework/aqueduct/legacy";
import { IContainerRuntime } from "@fluidframework/container-runtime-definitions/legacy";
import { FluidObject, IFluidHandle } from "@fluidframework/core-interfaces";
import { IFluidDataStoreFactory } from "@fluidframework/runtime-definitions/legacy";

import { type IFluidMountableView, MountableView } from "./mountableView/index.js";

const dataStoreId = "modelDataStore";

/**
 * @internal
 */
export type ViewCallback<T> = (fluidModel: T) => any;

/**
 * @internal
 */
export async function getDataStoreEntryPoint<T>(
	containerRuntime: IContainerRuntime,
	alias: string,
): Promise<T> {
	const entryPointHandle = (await containerRuntime.getAliasedDataStoreEntryPoint(alias)) as
		| IFluidHandle<T>
		| undefined;

	if (entryPointHandle === undefined) {
		throw new Error(`Default dataStore [${alias}] must exist`);
	}

	return entryPointHandle.get();
}

/**
 * @internal
 */
export interface IFluidMountableViewEntryPoint {
	getDefaultDataObject(): Promise<FluidObject>;
	getMountableDefaultView(path?: string): Promise<IFluidMountableView>;
}

/**
 * The ContainerViewRuntimeFactory is an example utility built to support binding a single model to a single view
 * within the container.  For more-robust implementation of binding views within the container, check out the examples
 * \@fluid-example/app-integration-container-views and \@fluid-example/multiview-container
 * @internal
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
			runtimeOptions: { enableRuntimeIdCompressor: "on" },
			provideEntryPoint: async (
				containerRuntime: IContainerRuntime,
			): Promise<IFluidMountableViewEntryPoint> => {
				const entryPoint = await getDataStoreEntryPoint<T>(containerRuntime, dataStoreId);

				const view = viewCallback(entryPoint);
				// eslint-disable-next-line @typescript-eslint/no-unsafe-return
				let getMountableDefaultView = async () => view;
				if (MountableView.canMount(view)) {
					getMountableDefaultView = async () => new MountableView(view);
				}

				return {
					getDefaultDataObject: async () => entryPoint as FluidObject,
					getMountableDefaultView,
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
