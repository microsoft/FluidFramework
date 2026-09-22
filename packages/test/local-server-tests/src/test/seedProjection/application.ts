/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import type {
	IContainerContext,
	IRuntimeFactory,
} from "@fluidframework/container-definitions/internal";
import { loadContainerRuntime } from "@fluidframework/container-runtime/internal";
import type { IContainerRuntime } from "@fluidframework/container-runtime-definitions/internal";
import { FluidDataStoreRuntime } from "@fluidframework/datastore/internal";
import type { IFluidDataStoreFactory } from "@fluidframework/runtime-definitions/internal";
import type { ITree } from "@fluidframework/tree";

import { seedRuntimeFactory, type ProjectionLoad, type Projector } from "./adapter.js";
import {
	buildNativeBaseline,
	projection,
	projectionKey,
	rootAlias,
	storeType,
	treeFactory,
	treeId,
} from "./baseline.js";
import { format, viewConfiguration, viewHtml, type HtmlView } from "./html.js";

export interface HtmlEntryPoint {
	view: HtmlView;
	sessionId: string | undefined;
}

/** One direct datastore, one DDS, no DataObject root Directory/Map. */
const dataStoreFactory: IFluidDataStoreFactory = {
	type: storeType,
	get IFluidDataStoreFactory() {
		return this;
	},
	async instantiateDataStore(context, existing) {
		if (!existing) {
			throw new Error("The baseline already contains the datastore and SharedTree");
		}
		const runtime = new FluidDataStoreRuntime(
			context,
			new Map([[treeFactory.type, treeFactory]]),
			existing,
			async (dataStore) => {
				const channel = (await dataStore.getChannel(treeId)) as unknown as ITree;
				const view = channel.viewWith(viewConfiguration);
				runtime.once("dispose", () => view.dispose());
				return {
					view,
					sessionId: dataStore.idCompressor?.localSessionId,
				} satisfies HtmlEntryPoint;
			},
		);
		return runtime;
	},
};

async function entryPoint(runtime: IContainerRuntime): Promise<HtmlEntryPoint> {
	const handle = await runtime.getAliasedDataStoreEntryPoint(rootAlias);
	if (handle === undefined) {
		throw new Error("Missing persisted root alias");
	}
	return (await handle.get()) as HtmlEntryPoint;
}

export const htmlProjector: Projector = {
	format,
	isNative: (context) => context.baseSnapshot?.blobs[".metadata"] !== undefined,
	async readSeed(context, retained) {
		const projectionTree = context.baseSnapshot?.trees[projectionKey];
		const manifestId = projectionTree?.blobs["manifest.work"];
		const htmlId = projectionTree?.blobs["document.html"];
		if (manifestId === undefined || htmlId === undefined) {
			throw new Error("Not a supported seed envelope");
		}
		if (
			retained !== undefined &&
			(retained.manifestId !== manifestId || retained.htmlId !== htmlId)
		) {
			throw new Error("Retained seed does not belong to this source snapshot");
		}
		const read = async (id: string): Promise<string> =>
			Buffer.from(await context.storage.readBlob(id)).toString("utf8");
		const manifest = retained?.manifest ?? (await read(manifestId));
		const parsed: unknown = JSON.parse(manifest);
		if (
			typeof parsed !== "object" ||
			parsed === null ||
			!("format" in parsed) ||
			parsed.format !== format ||
			!("html" in parsed) ||
			parsed.html !== "document.html" ||
			Object.keys(parsed).length !== 2
		) {
			throw new Error("Unsupported manifest version or contents");
		}
		return { manifestId, htmlId, manifest, html: retained?.html ?? (await read(htmlId)) };
	},
	materialize: (seed, sequenceNumber) => buildNativeBaseline(seed.html, sequenceNumber),
};

export interface AppObservation extends ProjectionLoad {
	original: IContainerContext;
	runtime: IContainerRuntime;
	app: HtmlEntryPoint;
}

export function applicationFactory(
	options: {
		allowProjection?: boolean;
		observe?: (observation: AppObservation) => void;
		beforeProjection?: (checkpoint: number) => void;
	} = {},
): IRuntimeFactory {
	return seedRuntimeFactory(
		htmlProjector,
		async (load, existing) => {
			let app: HtmlEntryPoint | undefined;
			const runtime = await loadContainerRuntime({
				context: load.context,
				existing,
				registryEntries: [[storeType, Promise.resolve(dataStoreFactory)]],
				oldestSupportedClient: "2.0.0",
				runtimeOptions: {
					enableRuntimeIdCompressor: "on",
					explicitSchemaControl: true,
					summaryOptions: {
						summaryConfigOverrides: {
							state: "disableHeuristics",
							initialSummarizerDelayMs: 0,
							maxAckWaitTime: 20_000,
							maxOpsSinceLastSummary: 7_000,
						},
					},
				},
				provideEntryPoint: entryPoint,
				experimentalSummaryOptions: {
					forceFullTree: load.projected,
					additionalRootTree: {
						key: projectionKey,
						summarize: () => {
							options.beforeProjection?.(load.context.deltaManager.lastSequenceNumber);
							if (app === undefined) {
								throw new Error("Projection tree must be realized before summarization");
							}
							return projection(viewHtml(app.view));
						},
					},
				},
			});
			// Realize on EVERY client, including the noninteractive summarizer. No model
			// initialization, alias creation or DDS writes occur here.
			app = await entryPoint(runtime);
			options.observe?.({ ...load, runtime, app });
			return runtime;
		},
		{
			allowProjection: options.allowProjection,
		},
	);
}
