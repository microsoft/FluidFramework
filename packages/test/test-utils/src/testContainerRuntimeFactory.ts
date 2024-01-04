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
import {
	FluidObject,
	IFluidHandleContext,
	IRequest,
	IResponse,
} from "@fluidframework/core-interfaces";
// eslint-disable-next-line import/no-deprecated
import { buildRuntimeRequestHandler, RuntimeRequestHandler } from "@fluidframework/request-handler";
import {
	IFluidDataStoreFactory,
	NamedFluidDataStoreRegistryEntries,
} from "@fluidframework/runtime-definitions";
import { RequestParser, RuntimeFactoryHelper } from "@fluidframework/runtime-utils";

interface backCompat_IFluidRouter {
	IFluidRouter?: backCompat_IFluidRouter;
	request(request: IRequest): Promise<IResponse>;
}

const backCompat_DefaultRouteRequestHandler = (defaultRootId: string) => {
	return async (request: IRequest, runtime: IContainerRuntime) => {
		const parser = RequestParser.create(request);
		if (parser.pathParts.length === 0) {
			return (
				runtime as any as Required<FluidObject<IFluidHandleContext>>
			).IFluidHandleContext.resolveHandle({
				url: `/${defaultRootId}${parser.query}`,
				headers: request.headers,
			});
		}
		return undefined; // continue search
	};
};

interface backCompat_ContainerRuntime {
	load(
		context: IContainerContext,
		registryEntries: NamedFluidDataStoreRegistryEntries,
		requestHandler?: (request: IRequest, runtime: IContainerRuntime) => Promise<IResponse>,
		runtimeOptions?: IContainerRuntimeOptions,
		containerScope?: FluidObject,
		existing?: boolean,
		containerRuntimeCtor?: typeof ContainerRuntime,
	): Promise<ContainerRuntime>;
}

/**
 * Create a container runtime factory class that allows you to set runtime options
 * @internal
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
			// Note: We use the deprecated `getRootDataStore` from v1.X here to allow for cross-major version compat
			// testing. Can be removed when we no longer support v1.X.
			await (runtime.getAliasedDataStoreEntryPoint?.("default") ??
				(
					runtime as any as {
						getRootDataStore(
							id: string,
							wait?: boolean,
						): Promise<backCompat_IFluidRouter>;
					}
				).getRootDataStore("default"));
		}

		async preInitialize(
			context: IContainerContext,
			existing: boolean,
		): Promise<IRuntime & IContainerRuntime> {
			if (containerRuntimeCtor.loadRuntime === undefined) {
				// Note: We use the deprecated `load` from v1.X here to allow for cross-major version compat testing.
				// Can be removed when we no longer support v1.X.
				return (containerRuntimeCtor as any as backCompat_ContainerRuntime).load(
					context,
					[
						["default", Promise.resolve(this.dataStoreFactory)],
						[this.type, Promise.resolve(this.dataStoreFactory)],
					],
					buildRuntimeRequestHandler(
						backCompat_DefaultRouteRequestHandler("default"),
						...this.requestHandlers,
					),
					this.runtimeOptions,
					context.scope,
					existing,
				);
			}
			const provideEntryPoint = async (runtime: IContainerRuntime) => {
				const entryPoint = await runtime.getAliasedDataStoreEntryPoint("default");
				if (entryPoint === undefined) {
					throw new Error("default dataStore must exist");
				}
				return entryPoint.get();
			};
			const getDefaultObject = async (request: IRequest, runtime: IContainerRuntime) => {
				const parser = RequestParser.create(request);
				if (parser.pathParts.length === 0) {
					// This cast is safe as ContainerRuntime.loadRuntime is called below
					return (runtime as ContainerRuntime).resolveHandle({
						url: `/default${parser.query}`,
						headers: request.headers,
					});
				}
				return undefined; // continue search
			};
			return containerRuntimeCtor.loadRuntime({
				context,
				registryEntries: [
					["default", Promise.resolve(this.dataStoreFactory)],
					[this.type, Promise.resolve(this.dataStoreFactory)],
				],
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
 * @internal
 */
export const TestContainerRuntimeFactory = createTestContainerRuntimeFactory(ContainerRuntime);
