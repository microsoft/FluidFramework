/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { IContainerContext, IRuntime } from "@fluidframework/container-definitions/internal";
import {
	ContainerRuntime,
	// eslint-disable-next-line import/no-deprecated
	DefaultSummaryConfiguration,
	type IContainerRuntimeOptionsInternal,
} from "@fluidframework/container-runtime/internal";
import {
	IContainerRuntime,
	// eslint-disable-next-line import/no-deprecated
	IContainerRuntimeWithResolveHandle_Deprecated,
} from "@fluidframework/container-runtime-definitions/internal";
import { FluidObject, IRequest, IResponse } from "@fluidframework/core-interfaces";
import { IFluidHandleContext } from "@fluidframework/core-interfaces/internal";
import { assert } from "@fluidframework/core-utils/internal";
import {
	// eslint-disable-next-line import/no-deprecated
	RuntimeRequestHandler,
	// eslint-disable-next-line import/no-deprecated
	buildRuntimeRequestHandler,
} from "@fluidframework/request-handler/internal";
import {
	IFluidDataStoreFactory,
	NamedFluidDataStoreRegistryEntries,
} from "@fluidframework/runtime-definitions/internal";
import { RequestParser, RuntimeFactoryHelper } from "@fluidframework/runtime-utils/internal";

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
		runtimeOptions?: IContainerRuntimeOptionsInternal,
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
			public runtimeOptions: IContainerRuntimeOptionsInternal = {
				summaryOptions: {
					summaryConfigOverrides: {
						// eslint-disable-next-line import/no-deprecated
						...DefaultSummaryConfiguration,
						...{
							initialSummarizerDelayMs: 0,
						},
					},
				},
			},
			// eslint-disable-next-line import/no-deprecated
			public requestHandlers: RuntimeRequestHandler[] = [],
		) {
			super();
		}

		public async instantiateFirstTime(runtime: ContainerRuntime): Promise<void> {
			// Back-compat - old code does not return IDataStore for rootContext.attachRuntime() call!
			// Thus need to leverage old API createDetachedRootDataStore() that is gone in latest releases.
			const rootContext =
				"createDetachedRootDataStore" in runtime
					? (runtime as any).createDetachedRootDataStore([this.type], "default")
					: runtime.createDetachedDataStore([this.type]);

			const rootRuntime = await this.dataStoreFactory.instantiateDataStore(
				rootContext,
				/* existing */ false,
			);
			const dataStore = await rootContext.attachRuntime(this.dataStoreFactory, rootRuntime);

			const result = await dataStore?.trySetAlias("default");
			assert(result === "Success" || result === undefined, "success");
		}

		public async instantiateFromExisting(runtime: ContainerRuntime): Promise<void> {
			// Validate we can load root data stores.
			// We should be able to load any data store that was created in initializeFirstTime!
			// Note: We use the deprecated `getRootDataStore` from v1.X here to allow for cross-major version compat
			// testing. Can be removed when we no longer support v1.X.
			await (runtime.getAliasedDataStoreEntryPoint?.("default") ??
				(
					runtime as any as {
						getRootDataStore(id: string, wait?: boolean): Promise<backCompat_IFluidRouter>;
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
					// eslint-disable-next-line import/no-deprecated
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
					// This cast is safe as loadContainerRuntime is called below
					// eslint-disable-next-line import/no-deprecated
					return (runtime as IContainerRuntimeWithResolveHandle_Deprecated).resolveHandle({
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
				// eslint-disable-next-line import/no-deprecated
				requestHandler: buildRuntimeRequestHandler(getDefaultObject, ...this.requestHandlers),
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
