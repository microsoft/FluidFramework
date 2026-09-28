/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import type {
	IContainerContext,
	IRuntime,
} from "@fluidframework/container-definitions/internal";
import {
	loadContainerRuntime,
	type ISummaryConfiguration,
	type ISummaryGenerationOptions,
} from "@fluidframework/container-runtime/internal";

import { createTextDataStoreFactory, layout, SeedEntryPoint } from "./textDataStore.js";
import type { TextSeed } from "./textSeedFormat.js";

/**
 * The same application runtime loads stored DDSs and constructs the initial disconnected graph.
 * Initial content and the fixed construction session are never supplied to a joining live client.
 */
export async function loadTextRuntime(
	context: IContainerContext,
	existing: boolean,
	options: {
		seed?: TextSeed;
		summaryConfigOverrides?: ISummaryConfiguration;
		fullTreePolicy?: ISummaryGenerationOptions["fullTreePolicy"];
	} = {},
): Promise<{ runtime: IRuntime; app: SeedEntryPoint }> {
	if (!existing && options.seed === undefined) {
		throw new Error("Text runtime creation requires initial content");
	}
	if (existing && options.seed !== undefined) {
		throw new Error("Initial content is only valid during disconnected construction");
	}
	const dataStoreFactory = createTextDataStoreFactory(options.seed);
	const runtime = await loadContainerRuntime({
		context,
		existing,
		registryEntries: [[layout.storeType, Promise.resolve(dataStoreFactory)]],
		oldestSupportedClient: "2.0.0",
		detachedConstructionOptions:
			options.seed === undefined
				? undefined
				: { idCompressorSessionId: "beefbeef-beef-4000-8000-000000000001" },
		summaryGenerationOptions: { fullTreePolicy: options.fullTreePolicy },
		runtimeOptions: {
			enableRuntimeIdCompressor: "on",
			explicitSchemaControl: true,
			summaryOptions: { summaryConfigOverrides: options.summaryConfigOverrides },
		},
		provideEntryPoint: async (container) => {
			const handle = await container.getAliasedDataStoreEntryPoint(layout.alias);
			const app = await handle?.get();
			if (!(app instanceof SeedEntryPoint)) {
				throw new TypeError("Missing persisted root entry point");
			}
			return app;
		},
	});
	try {
		if (!existing) {
			const store = await runtime.createDataStore(layout.storeType);
			await store.entryPoint.get();
			if ((await store.trySetAlias(layout.alias)) !== "Success") {
				throw new Error("Cannot assign the text application's root alias");
			}
		}
		const handle = await runtime.getAliasedDataStoreEntryPoint(layout.alias);
		const app = await handle?.get();
		if (!(app instanceof SeedEntryPoint)) {
			throw new TypeError("Missing persisted root entry point");
		}
		return { runtime, app };
	} catch (error) {
		runtime.dispose();
		throw error;
	}
}
