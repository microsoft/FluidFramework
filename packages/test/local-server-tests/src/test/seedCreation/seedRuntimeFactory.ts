/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { AttachState } from "@fluidframework/container-definitions";
import type {
	IContainerContext,
	IRuntimeFactory,
} from "@fluidframework/container-definitions/internal";
import { loadContainerRuntime } from "@fluidframework/container-runtime/internal";
import { FluidDataStoreRuntime } from "@fluidframework/datastore/internal";
import type { ISnapshotTree } from "@fluidframework/driver-definitions/internal";
import type { IFluidDataStoreFactory } from "@fluidframework/runtime-definitions/internal";
import { loggerToMonitoringContext } from "@fluidframework/telemetry-utils/internal";
import { wrapObjectAndOverride } from "@fluidframework/test-runtime-utils/internal";

import { layout, materializeSeed, treeFactory, treeKind } from "./runtimeMaterialization.js";
import { seedRoot } from "./seedFormat.js";
import { SeedSummaryHost } from "./summaryHost.js";
import { viewConfiguration, type TextView } from "./treeModel.js";

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
 * One loaded runtime's host-facing state. It is not shared across independent clients.
 */
export interface SeedLoad {
	/** True only when the original stored snapshot contained no native runtime state. */
	readonly fromSeed: boolean;
	/** The loader-owned context remains unmodified, including protocol, version and replay state. */
	readonly original: IContainerContext;
	/** Realized native model for this client. */
	readonly app: SeedEntryPoint;
	/** The only supported way to request summaries from the corresponding summarizer. */
	readonly summaries: SeedSummaryHost;
}

/**
 * Load a seed as deterministic native state, or load stored native state normally.
 * No callback preserves the seed root: native summaries deliberately replace the creation input.
 */
export function seedRuntimeFactory(
	options: {
		/** Prove that persisted native state loads without conversion or seed reads. */
		nativeOnly?: boolean;
		/** Receive the reference host and model once native loading has completed. */
		observe?: (load: SeedLoad) => void;
	} = {},
): IRuntimeFactory {
	return {
		get IRuntimeFactory() {
			return this;
		},
		async instantiateRuntime(original, existing) {
			if (
				!existing ||
				original.attachState !== AttachState.Attached ||
				original.baseSnapshot === undefined
			) {
				throw new Error("Only existing, externally created files are supported");
			}
			if (original.pendingLocalState !== undefined) {
				throw new Error("Pending/offline restoration is not supported by the seed reference");
			}
			const config = loggerToMonitoringContext(original.taggedLogger).config;
			if (config.getBoolean("Fluid.Summarizer.immediatelyRefreshLatestSummaryAck") === false) {
				throw new Error("The seed reference requires immediate summary ACK refresh");
			}
			if (config.getBoolean("Fluid.Container.enableOfflineFull") === true) {
				throw new Error("Offline loading is not supported by the seed reference");
			}
			const parent = original.getLoadedFromVersion()?.id;
			if (parent === undefined) throw new Error("A stored snapshot version is required");
			const source = original.baseSnapshot;
			const fromSeed = source.blobs[".metadata"] === undefined;
			if (fromSeed && options.nativeOnly === true)
				throw new Error("Native-only loader refuses a seed");
			if (fromSeed && original.deltaManager.initialSequenceNumber !== 0) {
				// materializeSeed() always reconstructs the pristine seed content. Tagging that
				// reconstruction with a nonzero checkpoint would tell the runtime it has already
				// incorporated ops it never actually replayed into the tree, silently dropping them.
				// Only the original creation checkpoint (sequence number 0) is safe to materialize.
				throw new Error(
					"Loading a seed snapshot after ops were sequenced is unsupported; only the original creation checkpoint can be materialized",
				);
			}
			const summaries = new SeedSummaryHost(parent, fromSeed);
			let snapshot = source;
			let virtualBlobs: ReadonlyMap<string, ArrayBuffer> = new Map();
			if (fromSeed) {
				const application: ISnapshotTree | undefined = source.trees[seedRoot];
				const seedId = application?.blobs["seed.json"];
				if (seedId === undefined || application?.groupId !== undefined) {
					throw new Error("Expected an ungrouped applicationProjection/seed.json");
				}
				const input: unknown = JSON.parse(
					Buffer.from(await original.storage.readBlob(seedId)).toString(),
				);
				const materialized = materializeSeed(
					input,
					original.deltaManager.initialSequenceNumber,
				);
				snapshot = {
					...source,
					blobs: { ...source.blobs, ...materialized.snapshot.blobs },
					trees: { ...source.trees, ...materialized.snapshot.trees },
				};
				virtualBlobs = materialized.blobs;
			}
			/** Only the loaded seed version has a virtual counterpart; later native versions pass through. */
			const overlay = (fetched: ISnapshotTree): ISnapshotTree => {
				if (!fromSeed || fetched.blobs[".metadata"] !== undefined) return fetched;
				if (fetched.id !== source.id)
					throw new Error("Refetch of another seed version is unsupported");
				return { ...fetched, blobs: snapshot.blobs, trees: snapshot.trees };
			};
			const storage = wrapObjectAndOverride(
				original.storage,
				{
					readBlob: (target) => async (id) => virtualBlobs.get(id) ?? target.readBlob(id),
					uploadSummaryWithContext: (target) => async (tree, summaryContext) =>
						summaries.upload(target, tree, summaryContext),
					getSnapshotTree:
						(target) =>
						async (...args) => {
							const fetched = await target.getSnapshotTree(...args);
							return fetched === null ? fetched : overlay(fetched);
						},
					getSnapshot: (target) =>
						target.getSnapshot === undefined
							? undefined
							: async (request) => {
									if ((request?.loadingGroupIds?.length ?? 0) > 0) {
										throw new Error("Loading groups are unsupported by the seed reference");
									}
									const fetched = await target.getSnapshot?.(request);
									if (fetched === undefined)
										throw new Error("Snapshot service became unavailable");
									const tree = overlay(fetched.snapshotTree);
									return tree === fetched.snapshotTree
										? fetched
										: {
												...fetched,
												snapshotTree: tree,
												blobContents: new Map([...fetched.blobContents, ...virtualBlobs]),
											};
								},
				},
				{ receiver: "target" },
			);
			const context = wrapObjectAndOverride(
				original,
				{
					baseSnapshot: () => snapshot,
					snapshotWithContents: () =>
						original.snapshotWithContents === undefined
							? undefined
							: {
									...original.snapshotWithContents,
									snapshotTree: snapshot,
									blobContents: new Map([
										...original.snapshotWithContents.blobContents,
										...virtualBlobs,
									]),
								},
					storage: () => storage,
				},
				{ receiver: "target" },
			);
			const runtime = await loadContainerRuntime({
				context,
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
				options.observe?.({ fromSeed, original, app, summaries });
				return wrapObjectAndOverride(
					runtime,
					{
						getPendingLocalState: () => () => {
							throw new Error("Pending/offline capture is unsupported by the seed reference");
						},
					},
					{ receiver: "target" },
				);
			} catch (error) {
				runtime.dispose();
				throw error;
			}
		},
	};
}
