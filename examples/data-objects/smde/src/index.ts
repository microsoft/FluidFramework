/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import {
	getDataStoreEntryPoint,
	type IFluidMountableViewEntryPoint,
	MountableView,
} from "@fluid-example/example-utils";
import type {
	IContainerContext,
	IRuntime,
} from "@fluidframework/container-definitions/legacy";
import { loadContainerRuntime } from "@fluidframework/container-runtime/legacy";
import type { IContainerRuntime } from "@fluidframework/container-runtime-definitions/legacy";
import type { FluidObject } from "@fluidframework/core-interfaces";
import type { IFluidDataStoreFactory } from "@fluidframework/runtime-definitions/legacy";
import { RuntimeFactoryHelper } from "@fluidframework/runtime-utils/legacy";
import React from "react";

import { type SmdeDataObject, SmdeFactory } from "./smde.js";
import { SmdeReactView } from "./smdeView.js";

const defaultComponentId = "default";

const smde = new SmdeFactory();

class SmdeContainerFactory extends RuntimeFactoryHelper {
	public async instantiateFirstTime(runtime: IContainerRuntime): Promise<void> {
		const dataStore = await runtime.createDataStore(smde.type);
		await dataStore.trySetAlias(defaultComponentId);
	}

	public async preInitialize(
		context: IContainerContext,
		existing: boolean,
	): Promise<IContainerRuntime & IRuntime> {
		const registryEntries = new Map<string, Promise<IFluidDataStoreFactory>>([
			[smde.type, Promise.resolve(smde)],
		]);

		const runtime = await loadContainerRuntime({
			context,
			registryEntries,
			existing,
			containerScope: context.scope,
			provideEntryPoint: async (
				containerRuntime: IContainerRuntime,
			): Promise<IFluidMountableViewEntryPoint> => {
				const smdeDataObject = await getDataStoreEntryPoint<SmdeDataObject>(
					containerRuntime,
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
					getMountableDefaultView,
				};
			},
		});

		return runtime;
	}
}

/**
 * @internal
 */
export const fluidExport = new SmdeContainerFactory();
