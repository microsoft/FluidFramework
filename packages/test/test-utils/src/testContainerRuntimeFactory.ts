/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { IContainerContext, IRuntime } from "@fluidframework/container-definitions";
import {
	ContainerRuntime,
	IContainerRuntimeOptions,
	DefaultSummaryConfiguration,
} from "@fluidframework/container-runtime";
import { IContainerRuntime } from "@fluidframework/container-runtime-definitions";
import { IRequest, IResponse } from "@fluidframework/core-interfaces";
// eslint-disable-next-line import/no-deprecated
import { buildRuntimeRequestHandler, RuntimeRequestHandler } from "@fluidframework/request-handler";
import { IFluidDataStoreFactory } from "@fluidframework/runtime-definitions";
import { create404Response, RuntimeFactoryHelper } from "@fluidframework/runtime-utils";

/**
 * Create a container runtime factory class that allows you to set runtime options
 */
export const createTestContainerRuntimeFactory = (
	containerRuntimeCtor: typeof ContainerRuntime,
) => {
	return class extends RuntimeFactoryHelper {
		constructor(
			public type: string,
			public dataStoreFactory: IFluidDataStoreFactory,
			public runtimeOptions: IContainerRuntimeOptions = {
				summaryOptions: {
					summaryConfigOverrides: {
						...DefaultSummaryConfiguration,
						...{
							initialSummarizerDelayMs: 0,
						},
					},
				},
			},
			public requestHandlers: RuntimeRequestHandler[] = [],
		) {
			super();
		}

		public async instantiateFirstTime(runtime: ContainerRuntime): Promise<void> {
			const rootContext = runtime.createDetachedRootDataStore([this.type], "default");
			const rootRuntime = await this.dataStoreFactory.instantiateDataStore(
				rootContext,
				/* existing */ false,
			);
			await rootContext.attachRuntime(this.dataStoreFactory, rootRuntime);
		}

		public async instantiateFromExisting(runtime: ContainerRuntime): Promise<void> {
			// Validate we can load root data stores.
			// We should be able to load any data store that was created in initializeFirstTime!
			await runtime.getAliasedDataStoreEntryPoint("default");
		}

		async preInitialize(
			context: IContainerContext,
			existing: boolean,
		): Promise<IRuntime & IContainerRuntime> {
			const provideEntryPoint = async (runtime: IContainerRuntime) => {
				const entryPoint = await runtime.getAliasedDataStoreEntryPoint("default");
				if (entryPoint === undefined) {
					throw new Error("default dataStore must exist");
				}
				return entryPoint.get();
			};
			const getDefaultObject = async (
				req: IRequest,
				runtime: IContainerRuntime,
			): Promise<IResponse> => {
				return req.url === "" || req.url === "/" || req.url.startsWith("/?")
					? {
							mimeType: "fluid/object",
							status: 200,
							value: await provideEntryPoint(runtime),
					  }
					: create404Response(req);
			};
			return containerRuntimeCtor.loadRuntime({
				context,
				registryEntries: [
					["default", Promise.resolve(this.dataStoreFactory)],
					[this.type, Promise.resolve(this.dataStoreFactory)],
				],
				// eslint-disable-next-line import/no-deprecated
				requestHandler: buildRuntimeRequestHandler(
					getDefaultObject,
					...this.requestHandlers,
				),
				provideEntryPoint,
				// ! This prop is needed for back-compat. Can be removed in 2.0.0-internal.8.0.0
				initializeEntryPoint: provideEntryPoint,
				runtimeOptions: this.runtimeOptions,
				containerScope: context.scope,
				existing,
			} as any);
		}
	};
};

/**
 * A container runtime factory that allows you to set runtime options
 */
export const TestContainerRuntimeFactory = createTestContainerRuntimeFactory(ContainerRuntime);
