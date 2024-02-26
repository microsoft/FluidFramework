/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { IContainerContext } from "@fluidframework/container-definitions";
import { ContainerRuntime } from "@fluidframework/container-runtime";
import { IContainerRuntime } from "@fluidframework/container-runtime-definitions";
import { IFluidDataStoreFactory } from "@fluidframework/runtime-definitions";
import { RuntimeFactoryHelper } from "@fluidframework/runtime-utils";
import { FluidObject } from "@fluidframework/core-interfaces";
import {
	getDataStoreEntryPoint,
	IFluidMountableViewEntryPoint,
	MountableView,
} from "@fluid-example/example-utils";

import React from "react";

import { CodeMirrorComponent, SmdeFactory } from "./codeMirror.js";
import { CodeMirrorReactView } from "./codeMirrorView.js";

export { CodeMirrorComponent, SmdeFactory } from "./codeMirror.js";
export { CodeMirrorReactView } from "./codeMirrorView.js";

const defaultComponentId = "default";

const smde = new SmdeFactory();

class CodeMirrorFactory extends RuntimeFactoryHelper {
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
				const codeMirror = await getDataStoreEntryPoint<CodeMirrorComponent>(
					containerRuntime,
					defaultComponentId,
				);

				const view = React.createElement(CodeMirrorReactView, {
					text: codeMirror.text,
					presenceManager: codeMirror.presenceManager,
				}) as any;
				// eslint-disable-next-line @typescript-eslint/no-unsafe-return
				let getMountableDefaultView = async () => view;
				if (MountableView.canMount(view)) {
					getMountableDefaultView = async () => new MountableView(view);
				}

				return {
					getDefaultDataObject: async () => codeMirror as FluidObject,
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
export const fluidExport = new CodeMirrorFactory();
