/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import type { IRuntimeFactory } from "@fluidframework/container-definitions/internal";
import { loadContainerRuntime } from "@fluidframework/container-runtime/internal";
import { FluidDataStoreRuntime } from "@fluidframework/datastore/internal";
import type { ISnapshotTree } from "@fluidframework/driver-definitions/internal";
import type { IFluidDataStoreFactory } from "@fluidframework/runtime-definitions/internal";

import { layout, materializeSeed, treeFactory, treeKind } from "./runtimeMaterialization.js";
import {
	seedRuntimeFactory,
	type SeedProjector,
	type SeedRuntimeLoad,
} from "./seedRuntimeAdapter.js";
import { seedRoot } from "./textSeedFormat.js";
import { viewConfiguration, type TextView } from "./textTreeSchema.js";

/**
 * Native model and this joining client's fresh compressor session.
 */
export class SeedEntryPoint {
	/** No initialization or alias writes are performed by this entry point. */
	public constructor(
		public readonly view: TextView,
		public readonly sessionId: string | undefined,
	) {}
}

/** Load the persisted graph; a missing graph is an error, never an instruction to initialize. */
const dataStoreFactory: IFluidDataStoreFactory = {
	type: layout.storeType,
	get IFluidDataStoreFactory() {
		return this;
	},
	async instantiateDataStore(context, existing) {
		if (!existing) throw new Error("The seed reference does not create live data stores");
		return new FluidDataStoreRuntime(
			context,
			new Map([[treeFactory.type, treeFactory]]),
			existing,
			async (store) => {
				const channel = await store.getChannel(layout.treeId);
				if (!treeKind.is(channel)) throw new Error("Expected the persisted SharedTree");
				const view = channel.viewWith(viewConfiguration);
				store.once("dispose", () => view.dispose());
				return new SeedEntryPoint(view, store.idCompressor?.localSessionId);
			},
		);
	},
};

/**
 * Text-specific seed reading and native construction, separate from runtime/context forwarding.
 * The materializer is a pinned internal fixture, not a general native-snapshot encoder.
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
			Buffer.from(await context.storage.readBlob(seedId)).toString(),
		);
		return input;
	},
	materialize: materializeSeed,
};

/**
 * One loaded runtime's host-facing state. It is not shared across independent clients.
 */
export interface SeedLoad extends SeedRuntimeLoad {
	/** Realized native model for this client. */
	readonly app: SeedEntryPoint;
}

/**
 * Compose the text application's normal runtime construction with the seed-loading adapter.
 * Application schema, registry, runtime options and entry point remain application-owned.
 */
export function sampleRuntimeFactory(
	options: {
		/** Prove that persisted native state loads without conversion or seed reads. */
		nativeOnly?: boolean;
		/** Receive the reference host and model once native loading has completed. */
		observe?: (load: SeedLoad) => void;
	} = {},
): IRuntimeFactory {
	return seedRuntimeFactory(
		textProjector,
		async (load, existing) => {
			const runtime = await loadContainerRuntime({
				context: load.context,
				existing,
				registryEntries: [[layout.storeType, Promise.resolve(dataStoreFactory)]],
				oldestSupportedClient: "2.0.0",
				runtimeOptions: {
					enableRuntimeIdCompressor: "on",
					explicitSchemaControl: true,
					summaryOptions: {
						summaryConfigOverrides: {
							state: "summaryOnRequest",
							initialSummarizerDelayMs: 0,
							maxAckWaitTime: 20_000,
							maxOpsSinceLastSummary: 7000,
						},
					},
				},
				provideEntryPoint: async (container) => {
					const handle = await container.getAliasedDataStoreEntryPoint(layout.alias);
					const app = await handle?.get();
					if (!(app instanceof SeedEntryPoint))
						throw new Error("Missing persisted root entry point");
					return app;
				},
			});
			try {
				const handle = await runtime.getAliasedDataStoreEntryPoint(layout.alias);
				const app = await handle?.get();
				if (!(app instanceof SeedEntryPoint))
					throw new Error("Missing persisted root entry point");
				options.observe?.({ ...load, app });
				return runtime;
			} catch (error) {
				runtime.dispose();
				throw error;
			}
		},
		{ allowProjection: options.nativeOnly !== true },
	);
}
