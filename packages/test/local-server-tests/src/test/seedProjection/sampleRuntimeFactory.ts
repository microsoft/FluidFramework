/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import type {
	IContainerContext,
	IRuntimeFactory,
} from "@fluidframework/container-definitions/internal";
import {
	loadContainerRuntime,
	type IAdditionalSummaryTree,
	type ISummaryGenerationContext,
	type IContainerRuntimeOptions,
} from "@fluidframework/container-runtime/internal";
import { SummaryType } from "@fluidframework/driver-definitions";
import type { IContainerRuntime } from "@fluidframework/container-runtime-definitions/internal";
import type { ISummaryContext } from "@fluidframework/driver-definitions/internal";
import { FluidDataStoreRuntime } from "@fluidframework/datastore/internal";
import type { IFluidDataStoreFactory } from "@fluidframework/runtime-definitions/internal";
import type { ITree } from "@fluidframework/tree";

import {
	projectionKey,
	readApplicationProjection,
	type HtmlPartId,
} from "./externalSeedFile.js";
import { format } from "./htmlSeedFormat.js";
import { viewConfiguration, type HtmlView } from "./htmlTreeSchema.js";
import { IncrementalHtmlProjection } from "./incrementalHtmlProjection.js";
import {
	buildNativeBaseline,
	rootAlias,
	storeType,
	treeFactory,
	treeId,
} from "./nativeSeedBaseline.js";
import {
	seedRuntimeFactory,
	type IProjectionLoad,
	type IProjector,
} from "./seedRuntimeAdapter.js";
import {
	seedBaselineBlobName,
	type SeedBaselineMismatchError,
} from "./seedBaselineFingerprint.js";

/** Live application surface exposed by each independently loaded sample runtime. */
export interface IHtmlEntryPoint {
	/** Collaborative HTML tree view, realized on interactive clients and summarizers before projection. */
	view: HtmlView;
	/** This client's fresh compressor session ID, used to verify genesis does not reuse a live session. */
	sessionId: string | undefined;
}

/**
 * Data store factory exposing a single SharedTree DDS per store instance, without a root Directory/Map.
 * The baseline already contains each store and channel: loading realizes them but never initializes
 * another graph or assigns aliases. This factory does not determine the number of store instances.
 */
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
				} satisfies IHtmlEntryPoint;
			},
		);
		return runtime;
	},
};

/**
 * Resolve the persisted root alias in the native graph materialized by {@link htmlProjector}.
 * sampleRuntimeFactory realizes this model before its factory returns; projection fails until it is ready.
 * Missing aliases fail rather than triggering write-on-open repair or asynchronous alias creation.
 */
async function entryPoint(runtime: IContainerRuntime): Promise<IHtmlEntryPoint> {
	const handle = await runtime.getAliasedDataStoreEntryPoint(rootAlias);
	if (handle === undefined) {
		throw new Error("Missing persisted root alias");
	}
	return (await handle.get()) as IHtmlEntryPoint;
}

/**
 * Implement the {@link IProjector} contract for the reference HTML seed format.
 * A runtime metadata blob identifies a native snapshot; otherwise read the application projection
 * using the same external-reader contract and build the native baseline at the unchanged checkpoint.
 * The implementation details live in readApplicationProjection and buildNativeBaseline; the adapter
 * owns snapshot overlays and op ordering. See DESIGN.md's "Runtime-owned conversion" section.
 */
export const htmlProjector: IProjector = {
	format,
	isNative: (context) => context.baseSnapshot?.blobs[".metadata"] !== undefined,
	async readSeed(context, retained) {
		if (context.baseSnapshot === undefined) {
			throw new Error("Not a supported seed envelope");
		}
		return readApplicationProjection(
			context.baseSnapshot,
			async (id) => context.storage.readBlob(id),
			{ retained },
		);
	},
	materialize: (seed, sequenceNumber) => buildNativeBaseline(seed.parts, sequenceNumber),
};

/** Test-only observation joining the adapter's decision with the loaded native runtime and model. */
export interface IAppObservation extends IProjectionLoad {
	/** Original loader context, kept separate from the native runtime's projected context. */
	original: IContainerContext;
	/** Actual loaded container runtime, not a mock or snapshot-builder instance. */
	runtime: IContainerRuntime;
	/** Realized application model whose state the projection callback reads. */
	app: IHtmlEntryPoint;
}

/**
 * Create the sample application's IRuntimeFactory, composing seed adaptation with normal native loading.
 * Realize the persisted SharedTree on every client, require full native state until its first tracked ACK,
 * and project the two HTML subtrees incrementally at this runtime's checkpoint. Loading emits no init ops.
 */
export function sampleRuntimeFactory(
	options: {
		/** Disable materialization to validate that graduated snapshots load as ordinary native state. */
		allowProjection?: boolean;
		/** Receive a completed load's contexts, runtime, and model for workflow assertions. */
		observe?: (observation: IAppObservation) => void;
		/** Test-only callback instrumentation/failure injection at the summarizer's checkpoint. */
		beforeProjection?: (checkpoint: number) => void;
		/** Test-only observation at the actual serializer boundary, never called for a reused part. */
		onSerializePart?: (part: HtmlPartId) => void;
		/** Observe effective generation mode and accepted parent without exposing mutable application state. */
		observeSummary?: (context: ISummaryGenerationContext) => void;
		/** Observe adoption after the projection's captured state becomes an accepted reuse baseline. */
		onSummaryAccepted?: (context: ISummaryContext) => void;
		/** Observe a fail-closed baseline disagreement, including captured pending runtime work. */
		onFingerprintMismatch?: (failure: SeedBaselineMismatchError) => void;
		/** Exercise ordinary native batching/compression/chunking without a separate test runtime. */
		transportOptions?: Pick<
			IContainerRuntimeOptions,
			"enableGroupedBatching" | "compressionOptions" | "chunkSizeInBytes"
		>;
		/** Let a host/test explicitly create summarizers instead of electing automatic background clients. */
		summaryOnRequest?: boolean;
	} = {},
): IRuntimeFactory {
	return seedRuntimeFactory(
		htmlProjector,
		async (load, existing) => {
			let summarizeProjection = (
				_context: ISummaryGenerationContext,
			): IAdditionalSummaryTree => {
				throw new Error("Projection tree must be realized before summarization");
			};
			const runtime = await loadContainerRuntime({
				context: load.context,
				existing,
				registryEntries: [[storeType, Promise.resolve(dataStoreFactory)]],
				oldestSupportedClient: "2.0.0",
				runtimeOptions: {
					...options.transportOptions,
					enableRuntimeIdCompressor: "on",
					explicitSchemaControl: true,
					summaryOptions: {
						summaryConfigOverrides: {
							state:
								options.summaryOnRequest === true ? "summaryOnRequest" : "disableHeuristics",
							initialSummarizerDelayMs: 0,
							maxAckWaitTime: 20_000,
							maxOpsSinceLastSummary: 7000,
						},
					},
				},
				provideEntryPoint: entryPoint,
				summaryGenerationOptions: {
					fullTreeUntilFirstAck: load.projected,
					additionalRootTree: {
						key: projectionKey,
						summarize: (context) => {
							options.beforeProjection?.(load.context.deltaManager.lastSequenceNumber);
							options.observeSummary?.(context);
							return summarizeProjection(context);
						},
					},
				},
			});
			// Realize on EVERY client, including the noninteractive summarizer. No model
			// initialization, alias creation or DDS writes occur here.
			const app = await entryPoint(runtime);
			const baseline = load.baseline;
			if (baseline === undefined) {
				throw new Error("The sample requires a seed baseline fingerprint");
			}
			const projection = new IncrementalHtmlProjection(app.view, options.onSerializePart);
			runtime.once("dispose", () => projection.dispose());
			summarizeProjection = (context) => {
				const result = projection.summarize(context);
				const onAccepted = result.onAccepted;
				return {
					summary: {
						...result.summary,
						tree: {
							...result.summary.tree,
							[seedBaselineBlobName]: {
								type: SummaryType.Blob,
								content: JSON.stringify(baseline),
							},
						},
					},
					onAccepted:
						onAccepted === undefined
							? undefined
							: (accepted) => {
									onAccepted(accepted);
									options.onSummaryAccepted?.(accepted);
								},
				};
			};
			options.observe?.({ ...load, runtime, app });
			return runtime;
		},
		{
			allowProjection: options.allowProjection,
			enforceBaselineFingerprint: true,
			onFingerprintMismatch: options.onFingerprintMismatch,
		},
	);
}
