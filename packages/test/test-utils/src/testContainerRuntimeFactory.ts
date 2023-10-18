/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

// eslint-disable-next-line import/no-deprecated
import { defaultRouteRequestHandler } from "@fluidframework/aqueduct";
import { IContainerContext, IRuntime } from "@fluidframework/container-definitions";
import {
	ContainerRuntime,
	IContainerRuntimeOptions,
	DefaultSummaryConfiguration,
} from "@fluidframework/container-runtime";
import { IContainerRuntime } from "@fluidframework/container-runtime-definitions";
// eslint-disable-next-line import/no-deprecated
import { buildRuntimeRequestHandler, RuntimeRequestHandler } from "@fluidframework/request-handler";
import { IFluidDataStoreFactory } from "@fluidframework/runtime-definitions";
import { RuntimeFactoryHelper } from "@fluidframework/runtime-utils";

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
			const runtime: ContainerRuntime = await containerRuntimeCtor.load(
				context,
				[
					["default", Promise.resolve(this.dataStoreFactory)],
					[this.type, Promise.resolve(this.dataStoreFactory)],
				],
				// eslint-disable-next-line import/no-deprecated
				buildRuntimeRequestHandler(
					// eslint-disable-next-line import/no-deprecated
					defaultRouteRequestHandler("default"),
					...this.requestHandlers,
				),
				this.runtimeOptions,
				context.scope,
				existing,
			);

			return runtime;
		}
	};
};

/**
 * A container runtime factory that allows you to set runtime options
 */
export const TestContainerRuntimeFactory = createTestContainerRuntimeFactory(ContainerRuntime);
