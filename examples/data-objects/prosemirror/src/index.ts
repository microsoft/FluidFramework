/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { IContainerContext } from "@fluidframework/container-definitions";
import { ContainerRuntime } from "@fluidframework/container-runtime";
import { IContainerRuntime } from "@fluidframework/container-runtime-definitions";
import { IFluidDataStoreFactory } from "@fluidframework/runtime-definitions";
import { RuntimeFactoryHelper } from "@fluidframework/runtime-utils";
import {
	getDataStoreEntryPoint,
	IFluidMountableViewEntryPoint,
	MountableView,
} from "@fluid-example/example-utils";
import { FluidObject } from "@fluidframework/core-interfaces";

import React from "react";

import { ProseMirror, ProseMirrorFactory, ProseMirrorReactView } from "./prosemirror.js";
export { ProseMirror, ProseMirrorFactory, ProseMirrorReactView } from "./prosemirror.js";

const defaultComponentId = "default";

const smde = new ProseMirrorFactory();

class ProseMirrorRuntimeFactory extends RuntimeFactoryHelper {
	public async instantiateFirstTime(runtime: ContainerRuntime): Promise<void> {
		const dataStore = await runtime.createDataStore(smde.type);
		await dataStore.trySetAlias(defaultComponentId);
	}

	public async preInitialize(
		context: IContainerContext,
		existing: boolean,
	): Promise<ContainerRuntime> {
		const registryEntries = new Map<string, Promise<IFluidDataStoreFactory>>([
			[smde.type, Promise.resolve(smde)],
		]);

		const runtime: ContainerRuntime = await ContainerRuntime.loadRuntime({
			context,
			registryEntries,
			existing,
			containerScope: context.scope,
			provideEntryPoint: async (
				containerRuntime: IContainerRuntime,
			): Promise<IFluidMountableViewEntryPoint> => {
				const proseMirror = await getDataStoreEntryPoint<ProseMirror>(
					containerRuntime,
					defaultComponentId,
				);

				const view = new MountableView(
					React.createElement(ProseMirrorReactView, {
						collabManager: proseMirror.collabManager,
					}),
				) as any;
				// eslint-disable-next-line @typescript-eslint/no-unsafe-return
				let getMountableDefaultView = async () => view;
				if (MountableView.canMount(view)) {
					getMountableDefaultView = async () => new MountableView(view);
				}

				return {
					getDefaultDataObject: async () => proseMirror as FluidObject,
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
export const fluidExport = new ProseMirrorRuntimeFactory();
