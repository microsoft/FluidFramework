/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { IContainerContext } from "@fluidframework/container-definitions";
import { ContainerRuntime } from "@fluidframework/container-runtime";
import { IContainerRuntime } from "@fluidframework/container-runtime-definitions";
import {
	IFluidDataStoreChannel,
	IFluidDataStoreFactory,
} from "@fluidframework/runtime-definitions";
import { RuntimeFactoryHelper } from "@fluidframework/runtime-utils";
import { MountableView } from "@fluidframework/view-adapters";

import React from "react";

import { ProseMirror, ProseMirrorFactory, ProseMirrorReactView } from "./prosemirror";
export { ProseMirror, ProseMirrorFactory, ProseMirrorReactView } from "./prosemirror";

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
		const registry = new Map<string, Promise<IFluidDataStoreFactory>>([
			[smde.type, Promise.resolve(smde)],
		]);

		const runtime: ContainerRuntime = await ContainerRuntime.loadRuntime({
			context,
			registryEntries: registry,
			existing,
			initializeEntryPoint: async (containerRuntime: IContainerRuntime) => {
				// ISSUE: IContainerRuntime doesn't have methods that expose data stores as IDataStore or
				// IFluidDataStoreChannel, which expose entryPoint. getRootDataStore returns an IFluidRouter.
				const dataStore: IFluidDataStoreChannel = (await containerRuntime.getRootDataStore(
					defaultComponentId,
				)) as IFluidDataStoreChannel;

				// TODO: better type discovery
				const proseMirror: ProseMirror = (await dataStore.entryPoint?.get()) as ProseMirror;
				if (proseMirror === undefined) {
					throw new Error("DataStore did not set its EntryPoint");
				}

				return new MountableView(
					React.createElement(ProseMirrorReactView, {
						collabManager: proseMirror.collabManager,
					}),
				);
			},
		});

		return runtime;
	}
}

export const fluidExport = new ProseMirrorRuntimeFactory();
