/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { type IContainerContext } from "@fluidframework/container-definitions/internal";
import { ContainerRuntime } from "@fluidframework/container-runtime/internal";
import type { IContainerRuntimeOptions } from "@fluidframework/container-runtime/internal";
import { type IContainerRuntime } from "@fluidframework/container-runtime-definitions/internal";
import { type FluidObject } from "@fluidframework/core-interfaces";
import { assert } from "@fluidframework/core-utils/internal";
import {
	type IContainerRuntimeBase,
	type NamedFluidDataStoreRegistryEntries,
} from "@fluidframework/runtime-definitions/internal";
import { loggerToMonitoringContext } from "@fluidframework/telemetry-utils/internal";

import {
	attributorDataStoreAlias,
	enableOnNewFileKey,
	type IProvideRuntimeAttributor,
	type IRuntimeAttributor,
} from "./attributorContracts.js";
import { RuntimeAttributorFactory } from "./runtimeAttributorDataStoreFactory.js";

/**
 * Utility function to get the runtime attributor from the container runtime.
 * @param runtime - container runtime from which attributor is to be fetched.
 * @returns IRuntimeAttributor if it exists, otherwise undefined.
 * @internal
 */
export async function getRuntimeAttributor(
	runtime: IContainerRuntimeBase,
): Promise<IRuntimeAttributor | undefined> {
	const entryPoint = await runtime.getAliasedDataStoreEntryPoint(attributorDataStoreAlias);
	const runtimeAttributor = (await entryPoint?.get()) as
		| FluidObject<IProvideRuntimeAttributor>
		| undefined;
	return runtimeAttributor?.IRuntimeAttributor;
}

/**
 * Mixes in logic to load and store runtime-based attribution functionality.
 *
 * Existing documents without stored attributor will not start storing attribution information. We only create the attributor
 * if its tracking is enabled and we are creating a new document.
 * @param Base - base class, inherits from FluidAttributorRuntime
 * @internal
 */
export const mixinAttributor = (
	Base: typeof ContainerRuntime = ContainerRuntime,
): typeof ContainerRuntime =>
	class ContainerRuntimeWithAttributor extends Base {
		public static async loadRuntime(params: {
			context: IContainerContext;
			registryEntries: NamedFluidDataStoreRegistryEntries;
			existing: boolean;
			runtimeOptions?: IContainerRuntimeOptions;
			containerScope?: FluidObject;
			containerRuntimeCtor?: typeof ContainerRuntime;
			provideEntryPoint: (containerRuntime: IContainerRuntime) => Promise<FluidObject>;
		}): Promise<ContainerRuntime> {
			const {
				context,
				registryEntries,
				existing,
				provideEntryPoint,
				runtimeOptions,
				containerScope,
				containerRuntimeCtor = ContainerRuntimeWithAttributor as unknown as typeof ContainerRuntime,
			} = params;

			const mc = loggerToMonitoringContext(context.taggedLogger);
			const factory = new RuntimeAttributorFactory();
			const registryEntriesCopy: NamedFluidDataStoreRegistryEntries = [
				...registryEntries,
				[RuntimeAttributorFactory.type, Promise.resolve(factory)],
			];
			const shouldTrackAttribution = mc.config.getBoolean(enableOnNewFileKey) ?? false;
			if (shouldTrackAttribution) {
				const { options } = context;
				// eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
				(options.attribution ??= {}).track = true;
			}

			// eslint-disable-next-line @typescript-eslint/no-unsafe-argument
			const runtime = (await Base.loadRuntime({
				context,
				registryEntries: registryEntriesCopy,
				provideEntryPoint,
				runtimeOptions,
				containerScope,
				existing,
				containerRuntimeCtor,
				// eslint-disable-next-line @typescript-eslint/no-explicit-any
			} as any)) as ContainerRuntimeWithAttributor;

			let runtimeAttributor: IRuntimeAttributor | undefined;
			if (shouldTrackAttribution) {
				if (existing) {
					runtimeAttributor = await getRuntimeAttributor(runtime);
				} else {
					const datastore = await runtime.createDataStore(RuntimeAttributorFactory.type);
					const result = await datastore.trySetAlias(attributorDataStoreAlias);
					assert(
						result === "Success",
						0xa1b /* Failed to set alias for attributor data store */,
					);
					runtimeAttributor = (await datastore.entryPoint.get()) as IRuntimeAttributor;
					assert(runtimeAttributor !== undefined, 0xa1c /* Attributor should be defined */);
				}
			}

			return runtime;
		}
	} as unknown as typeof ContainerRuntime;
