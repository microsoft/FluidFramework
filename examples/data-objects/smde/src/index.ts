/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { IContainerContext } from "@fluidframework/container-definitions";
import { ContainerRuntime } from "@fluidframework/container-runtime";
import { IContainerRuntime } from "@fluidframework/container-runtime-definitions";
import { IFluidDataStoreFactory } from "@fluidframework/runtime-definitions";
import { RuntimeFactoryHelper } from "@fluidframework/runtime-utils";
import { MountableView } from "@fluidframework/view-adapters";
import { IFluidMountableViewEntryPoint } from "@fluidframework/view-interfaces";
import { FluidObject } from "@fluidframework/core-interfaces";
import { getDataStoreEntryPoint } from "@fluid-example/example-utils";

import React from "react";

import { SmdeDataObject, SmdeFactory } from "./smde";
import { SmdeReactView } from "./smdeView";

const defaultComponentId = "default";

const smde = new SmdeFactory();

class SmdeContainerFactory extends RuntimeFactoryHelper {
	public async instantiateFirstTime(runtime: ContainerRuntime): Promise<void> {
		const dataStore = await runtime.createDataStore(smde.type);
		await dataStore.trySetAlias(defaultComponentId);
	}

	public async preInitialize(
		context: IContainerContext,
		existing: boolean,
	): Promise<ContainerRuntime> {
		const registry = new Map<string, Promise<IFluidDataStoreFactory>>([
			[smde.type, Promise.resolve(smde)],
		]);

		const runtime: ContainerRuntime = await ContainerRuntime.loadRuntime({
			context,
			registryEntries: registry,
			existing,
			containerScope: context.scope,
			provideEntryPoint: async (
				containerRuntime: IContainerRuntime,
			): Promise<IFluidMountableViewEntryPoint> => {
				// ISSUE: IContainerRuntime doesn't have methods that expose data stores as IDataStore or
				// IFluidDataStoreChannel, which expose entryPoint. getRootDataStore returns an IFluidRouter.
				const smdeDataObject = await getDataStoreEntryPoint<SmdeDataObject>(
					runtime,
					defaultComponentId,
				);

				const view = React.createElement(SmdeReactView, {
					smdeDataObject,
				}) as any;
				// eslint-disable-next-line @typescript-eslint/no-unsafe-return
				let getMountableDefaultView = async () => view;
				if (MountableView.canMount(view)) {
					getMountableDefaultView = async () => new MountableView(view);
				}

				return {
					getDefaultDataObject: async () => smdeDataObject as FluidObject,
					// eslint-disable-next-line @typescript-eslint/no-unsafe-return
					getDefaultView: async () => view,
					getMountableDefaultView,
				};
			},
		});

		return runtime;
	}
}

export const fluidExport = new SmdeContainerFactory();
