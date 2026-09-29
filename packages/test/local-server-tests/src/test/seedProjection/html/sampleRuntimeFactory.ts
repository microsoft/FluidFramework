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
	type IApplicationProjectionSummary,
	type ISummaryGenerationContext,
	type IContainerRuntimeOptions,
} from "@fluidframework/container-runtime/internal";
import type { IContainerRuntime } from "@fluidframework/container-runtime-definitions/internal";
import type { ISummaryContext } from "@fluidframework/driver-definitions/internal";
import { FluidDataStoreRuntime } from "@fluidframework/datastore/internal";
import type {
	IFluidDataStoreFactory,
	ISummaryTreeWithStats,
} from "@fluidframework/runtime-definitions/internal";
import { addBlobToSummary } from "@fluidframework/runtime-utils/internal";
import type { ITree } from "@fluidframework/tree";

import { projectionLayout, readApplicationProjection } from "./appProjection.js";
import { viewConfiguration, type HtmlView } from "./htmlTreeSchema.js";
import { HtmlSummaryProjection } from "./htmlSummaryProjection.js";
import {
	buildRuntimeSnapshot,
	rootAlias,
	storeType,
	treeFactory,
	treeId,
} from "./runtimeMaterialization.js";
import {
	seedRuntimeFactory,
	type IProjectionLoad,
	type IProjector,
} from "./seedRuntimeAdapter.js";
import {
	seedBaselineBlobName,
	type ISeedBaselineDescriptor,
	type SeedBaselineMismatchError,
} from "./seedBaselineFingerprint.js";

/**
 * Application-internal identity of the deterministic HTML-to-SharedTree rules.
 * It is not the external HTML format, the native schema namespace, or a Fluid codec version.
 */
export const htmlMaterializationProfile = "reference-html-materialization/2";

/**
 * Live application surface exposed by each independently loaded sample runtime.
 */
export interface IHtmlEntryPoint {
	/** Collaborative HTML tree view, realized on interactive clients and summarizers before projection. */
	view: HtmlView;
	/** This client's fresh compressor session ID, used to verify genesis does not reuse a live session. */
	sessionId: string | undefined;
}

/**
 * Application data-store runtime preserving immutable construction identity beside the SharedTree channel.
 * Loading realizes the generated or stored graph without initializing another graph or assigning aliases.
 * The public summary extensions preserve ordinary native summary statistics and handle reuse.
 */
class HtmlDataStoreRuntime extends FluidDataStoreRuntime {
	private readonly identityContent: string;

	/** Capture the immutable descriptor independently of the factory's construction scope. */
	public constructor(
		baseline: ISeedBaselineDescriptor,
		...args: ConstructorParameters<typeof FluidDataStoreRuntime>
	) {
		super(...args);
		this.identityContent = JSON.stringify(baseline);
	}

	/** Add the internal descriptor without changing native channel summary statistics or handle rules. */
	private appendIdentity(summary: ISummaryTreeWithStats): ISummaryTreeWithStats {
		if (summary.summary.tree[seedBaselineBlobName] !== undefined) {
			throw new Error("The native application identity path is reserved");
		}
		addBlobToSummary(summary, seedBaselineBlobName, this.identityContent);
		return summary;
	}

	/**
	 * Preserve public native summarization and include the immutable identity with matching statistics.
	 * Whole-store handles retain the identity already stored in the accepted parent.
	 */
	public override async summarize(
		...args: Parameters<FluidDataStoreRuntime["summarize"]>
	): Promise<ISummaryTreeWithStats> {
		return this.appendIdentity(await super.summarize(...args));
	}

	/** Include the same descriptor through the public synchronous attach-summary surface. */
	public override getAttachSummary(
		...args: Parameters<FluidDataStoreRuntime["getAttachSummary"]>
	): ISummaryTreeWithStats {
		return this.appendIdentity(super.getAttachSummary(...args));
	}
}

/** Load the already materialized store and DDS without initialization writes or new aliases. */
function createDataStoreFactory(baseline: ISeedBaselineDescriptor): IFluidDataStoreFactory {
	return {
		type: storeType,
		get IFluidDataStoreFactory() {
			return this;
		},
		async instantiateDataStore(context, existing) {
			if (!existing) {
				throw new Error("The baseline already contains the datastore and SharedTree");
			}
			const runtime = new HtmlDataStoreRuntime(
				baseline,
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
}

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
 * using the same external-reader contract and generate the runtime snapshot at the unchanged checkpoint.
 * The implementation details live in readApplicationProjection and buildRuntimeSnapshot; the adapter
 * overlays native state at the original checkpoint while the Loader owns op replay. See "Runtime-owned conversion"
 * in docs/content/Architecture/Application-Projections/Fluid-Design.md from the repository root.
 */
export const htmlProjector: IProjector = {
	materializationProfile: htmlMaterializationProfile,
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
	materialize: (seed, sequenceNumber) => buildRuntimeSnapshot(seed.parts, sequenceNumber),
};

/**
 * Application load instrumentation for a host to inspect adaptation, runtime, and realized model.
 * The test adapter records this same host-facing event; assertions and failure injection live in html/test.
 */
export interface IHtmlApplicationLoad extends IProjectionLoad {
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
 * and project named HTML subtrees incrementally at this runtime's checkpoint. Loading emits no init ops.
 */
export function sampleRuntimeFactory(
	options: {
		/** Disable materialization to validate that graduated snapshots load as ordinary native state. */
		allowProjection?: boolean;
		/** Select application rules in the runtime factory, never from external content or the native schema. */
		projector?: IProjector;
		/** Inspect completed adaptation and model realization for host diagnostics. */
		observe?: (observation: IHtmlApplicationLoad) => void;
		/** Synchronous application checkpoint hook; throwing aborts projection before storage upload. */
		beforeProjection?: (checkpoint: number) => void;
		/** Measure actual serializer work; reused parts do not cross this boundary. */
		onSerializePart?: (part: string) => void;
		/** Observe effective generation mode and accepted parent without exposing mutable application state. */
		observeSummary?: (context: ISummaryGenerationContext) => void;
		/** Observe adoption after the projection's captured state becomes an accepted reuse baseline. */
		onSummaryAccepted?: (context: ISummaryContext) => void;
		/** Observe a fail-closed baseline disagreement, including captured pending runtime work. */
		onFingerprintMismatch?: (failure: SeedBaselineMismatchError) => void;
		/** Configure ordinary native batching, compression, and chunking for the application transport. */
		transportOptions?: Pick<
			IContainerRuntimeOptions,
			"enableGroupedBatching" | "compressionOptions" | "chunkSizeInBytes"
		>;
		/** Let a host/test explicitly create summarizers instead of electing automatic background clients. */
		summaryOnRequest?: boolean;
	} = {},
): IRuntimeFactory {
	return seedRuntimeFactory(
		options.projector ?? htmlProjector,
		async (load, existing) => {
			const baseline = load.baseline;
			if (baseline === undefined) {
				throw new Error("The sample requires a seed baseline fingerprint");
			}
			let summarizeProjection = (
				_context: ISummaryGenerationContext,
			): IApplicationProjectionSummary => {
				throw new Error("Projection tree must be realized before summarization");
			};
			const captureProjection = (
				context: ISummaryGenerationContext,
			): IApplicationProjectionSummary => {
				options.beforeProjection?.(load.context.deltaManager.lastSequenceNumber);
				options.observeSummary?.(context);
				return summarizeProjection(context);
			};
			const runtime = await loadContainerRuntime({
				context: load.context,
				existing,
				registryEntries: [[storeType, Promise.resolve(createDataStoreFactory(baseline))]],
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
					fullTreePolicy: load.projected ? "untilFirstAck" : "default",
					additionalRootTree: {
						key: projectionLayout.key,
						createSummary: captureProjection,
						summarize: captureProjection,
					},
				},
			});
			// Realize on EVERY client, including the noninteractive summarizer. No model
			// initialization, alias creation or DDS writes occur here.
			const app = await entryPoint(runtime);
			const projection = new HtmlSummaryProjection(app.view, options.onSerializePart, {
				manifest: load.applicationManifest?.content,
			});
			runtime.once("dispose", () => projection.dispose());
			summarizeProjection = (context) => {
				const result = projection.summarize(context);
				const onAccepted = result.onAccepted;
				return {
					summary: result.summary,
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
