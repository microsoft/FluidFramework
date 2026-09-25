/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import type {
	IRuntime,
	IRuntimeFactory,
} from "@fluidframework/container-definitions/internal";
import {
	seedRuntimeFactory,
	type SeedProjector,
	type SeedRuntimeLoad,
} from "@fluidframework/container-loader/legacy/alpha";
import type { ISummaryConfiguration } from "@fluidframework/container-runtime/internal";
import type { ISnapshotTree } from "@fluidframework/driver-definitions/internal";

import { materializeSeed } from "./runtimeMaterialization.js";
import { loadTextRuntime } from "./textContainerRuntime.js";
import type { SeedEntryPoint } from "./textDataStore.js";
import { seedRoot } from "./textSeedFormat.js";

/**
 * The application owns its input format and conversion, not Fluid's serialization format.
 */
export const textProjector: SeedProjector = {
	isNative: (context) => context.baseSnapshot?.blobs[".metadata"] !== undefined,
	async readSeed(context) {
		const application: ISnapshotTree | undefined = context.baseSnapshot?.trees[seedRoot];
		const seedId = application?.blobs["seed.json"];
		if (seedId === undefined || application?.groupId !== undefined) {
			throw new Error("Expected an ungrouped applicationProjection/seed.json");
		}
		const input: unknown = JSON.parse(
			new TextDecoder().decode(await context.storage.readBlob(seedId)),
		);
		return input;
	},
	materialize: materializeSeed,
};

/**
 * One loaded runtime's application state, available to its host.
 */
export interface SeedLoad extends SeedRuntimeLoad {
	/** Realized application model for this client. */
	readonly app: SeedEntryPoint;
}

/**
 * Add seed support before ordinary runtime loading; summary lifecycle remains runtime-owned.
 */
export function sampleRuntimeFactory(
	options: {
		/** Load persisted DDSs with the ordinary factory, without the seed adapter. */
		nativeOnly?: boolean;
		/** Omit to retain normal automatic summarizer election and scheduling. */
		summaryConfigOverrides?: ISummaryConfiguration;
		/** Observe the model after successful runtime loading. */
		observe?: (load: SeedLoad) => void;
	} = {},
): IRuntimeFactory {
	const delegate = async (load: SeedRuntimeLoad, existing: boolean): Promise<IRuntime> => {
		const { runtime, app } = await loadTextRuntime(load.context, existing, {
			summaryConfigOverrides: options.summaryConfigOverrides,
			fullTreePolicy: load.fromSeed ? "untilFirstAck" : "default",
		});
		try {
			options.observe?.({ ...load, app });
			return runtime;
		} catch (error) {
			runtime.dispose();
			throw error;
		}
	};
	if (options.nativeOnly) {
		return {
			get IRuntimeFactory() {
				return this;
			},
			instantiateRuntime: async (context, existing) =>
				delegate({ context, original: context, fromSeed: false }, existing),
		};
	}
	return seedRuntimeFactory(textProjector, delegate);
}
