/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import type { IRuntime } from "@fluidframework/container-definitions/internal";
import { loadContainerRuntime } from "@fluidframework/container-runtime/internal";
import type { LoadContainerRuntimeParams } from "@fluidframework/container-runtime/internal";
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
 * Loads the ContainerRuntime with the ability to load and store runtime-based attribution functionality.
 *
 * Existing documents without stored attributor will not start storing attribution information. We only create the attributor
 * if its tracking is enabled and we are creating a new document.
 *
 * @internal
 */
export async function loadRuntimeWithAttribution(
	params: LoadContainerRuntimeParams,
): Promise<IContainerRuntime & IRuntime> {
	const {
		context,
		registryEntries,
		existing,
		requestHandler,
		provideEntryPoint,
		runtimeOptions,
		containerScope,
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

	const runtime = await loadContainerRuntime({
		context,
		registryEntries: registryEntriesCopy,
		requestHandler,
		provideEntryPoint,
		runtimeOptions,
		containerScope,
		existing,
	});

	let runtimeAttributor: IRuntimeAttributor | undefined;
	if (shouldTrackAttribution) {
		if (existing) {
			runtimeAttributor = await getRuntimeAttributor(runtime);
		} else {
			const datastore = await runtime.createDataStore(RuntimeAttributorFactory.type);
			const result = await datastore.trySetAlias(attributorDataStoreAlias);
			assert(result === "Success", 0xa1b /* Failed to set alias for attributor data store */);
			runtimeAttributor = (await datastore.entryPoint.get()) as IRuntimeAttributor;
			assert(runtimeAttributor !== undefined, 0xa1c /* Attributor should be defined */);
		}
	}

	return runtime;
}
