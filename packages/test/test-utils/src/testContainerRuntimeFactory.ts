/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { fail } from "node:assert";

import { IContainerContext, IRuntime } from "@fluidframework/container-definitions/internal";
import {
	ContainerRuntime,
	DefaultSummaryConfiguration,
	FluidDataStoreRegistry,
	type IContainerRuntimeOptionsInternal,
} from "@fluidframework/container-runtime/internal";
import {
	IContainerRuntime,
	// eslint-disable-next-line import-x/no-deprecated
	IContainerRuntimeWithResolveHandle_Deprecated,
} from "@fluidframework/container-runtime-definitions/internal";
import { FluidObject, IRequest, IResponse } from "@fluidframework/core-interfaces";
import { assert } from "@fluidframework/core-utils/internal";
import {
	// eslint-disable-next-line import-x/no-deprecated
	RuntimeRequestHandler,
	// eslint-disable-next-line import-x/no-deprecated
	buildRuntimeRequestHandler,
} from "@fluidframework/request-handler/internal";
import {
	IFluidDataStoreFactory,
	NamedFluidDataStoreRegistryEntries,
	type OldestSupportedClientVersion,
} from "@fluidframework/runtime-definitions/internal";
import { RequestParser, RuntimeFactoryHelper } from "@fluidframework/runtime-utils/internal";

import { defaultTestOldestSupportedClient } from "./testCompatibility.js";

/**
 * loadRuntime API before https://github.com/microsoft/FluidFramework/pull/27685 took registryEntries instead of registry.
 */
interface backCompat_ContainerRuntime_loadRuntime {
	loadRuntime(params: {
		context: IContainerContext;
		registryEntries: NamedFluidDataStoreRegistryEntries;
		existing: boolean;
		requestHandler?: (request: IRequest, runtime: IContainerRuntime) => Promise<IResponse>;
		provideEntryPoint: (containerRuntime: IContainerRuntime) => Promise<FluidObject>;
		runtimeOptions?: IContainerRuntimeOptionsInternal;
		containerScope?: FluidObject;
		// Some versions of this API exist which expect this to be provided under the name `minVersionForCollab` (before https://github.com/microsoft/FluidFramework/pull/27806),
		// so this fails to actually set minVersionForCollab in some old cases, but it was optional then so does not error.
		// That predates the versioning of this API, so we mitigate by setting both.
		oldestSupportedClient: OldestSupportedClientVersion | undefined;
		minVersionForCollab: OldestSupportedClientVersion | undefined;
	}): Promise<ContainerRuntime>;
}

/**
 * Create a container runtime factory class that allows you to set runtime options
 * @internal
 */
export const createTestContainerRuntimeFactory = (
	containerRuntimeCtor: typeof ContainerRuntime,
	// eslint-disable-next-line @typescript-eslint/explicit-function-return-type -- Returning anonymous class type
) => {
	return class extends RuntimeFactoryHelper {
		constructor(
			public type: string,
			public dataStoreFactory: IFluidDataStoreFactory,
			public runtimeOptions: IContainerRuntimeOptionsInternal = {
				summaryOptions: {
					summaryConfigOverrides: {
						...DefaultSummaryConfiguration,
						...{
							initialSummarizerDelayMs: 0,
						},
					},
				},
			},
			public minVersionForCollab: OldestSupportedClientVersion = defaultTestOldestSupportedClient,
			// eslint-disable-next-line import-x/no-deprecated
			public requestHandlers: RuntimeRequestHandler[] = [],
		) {
			super();
		}

		public async instantiateFirstTime(runtime: ContainerRuntime): Promise<void> {
			const rootContext = runtime.createDetachedDataStore([this.type]);

			const rootRuntime = await this.dataStoreFactory.instantiateDataStore(
				rootContext,
				/* existing */ false,
			);
			const dataStore = await rootContext.attachRuntime(this.dataStoreFactory, rootRuntime);

			const result = await dataStore.trySetAlias("default");
			assert(result === "Success", "success");
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
			const provideEntryPoint = async (runtime: IContainerRuntime): Promise<FluidObject> => {
				const entryPoint = await runtime.getAliasedDataStoreEntryPoint("default");
				if (entryPoint === undefined) {
					throw new Error("default dataStore must exist");
				}
				return entryPoint.get();
			};
			const getDefaultObject = async (
				request: IRequest,
				runtime: IContainerRuntime,
			): Promise<IResponse | undefined> => {
				const parser = RequestParser.create(request);
				if (parser.pathParts.length === 0) {
					// This cast is safe as loadContainerRuntime is called below
					// eslint-disable-next-line import-x/no-deprecated
					return (runtime as IContainerRuntimeWithResolveHandle_Deprecated).resolveHandle({
						url: `/default${parser.query}`,
						headers: request.headers,
					});
				}
				return undefined; // continue search
			};

			// This usage of `containerRuntimeCtor.loadRuntime`, an `@internal` API, called on past versions of this package,
			// adds an extra constraint that makes changing that API more difficult than it otherwise would be.
			// Actual customers / apps should not be dependent on stability of this API, but this code is, at least for now.
			const registryEntries: NamedFluidDataStoreRegistryEntries = [
				["default", Promise.resolve(this.dataStoreFactory)],
				[this.type, Promise.resolve(this.dataStoreFactory)],
			];
			// eslint-disable-next-line import-x/no-deprecated
			const requestHandler = buildRuntimeRequestHandler(
				getDefaultObject,
				...this.requestHandlers,
			);

			const loadRuntimeVersion = containerRuntimeCtor.loadRuntimeAPIVersion ?? 1;
			switch (loadRuntimeVersion) {
				case 1:
					// Old loadRuntime: took registryEntries instead of registry.
					return (
						containerRuntimeCtor as unknown as backCompat_ContainerRuntime_loadRuntime
					).loadRuntime({
						context,
						registryEntries,
						requestHandler,
						provideEntryPoint,
						runtimeOptions: this.runtimeOptions,
						containerScope: context.scope,
						existing,
						oldestSupportedClient: this.minVersionForCollab,
						minVersionForCollab: this.minVersionForCollab,
					});
				case 2:
					return containerRuntimeCtor.loadRuntime({
						context,
						registry: new FluidDataStoreRegistry(registryEntries),
						requestHandler,
						provideEntryPoint,
						runtimeOptions: this.runtimeOptions,
						containerScope: context.scope,
						existing,
						oldestSupportedClient: this.minVersionForCollab,
					});
				default:
					fail();
			}
		}
	};
};

/**
 * A container runtime factory that allows you to set runtime options
 * @internal
 */
export const TestContainerRuntimeFactory = createTestContainerRuntimeFactory(ContainerRuntime);
