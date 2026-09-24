/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { AttachState } from "@fluidframework/container-definitions";
import type {
	IContainerContext,
	IRuntime,
	IRuntimeFactory,
} from "@fluidframework/container-definitions/internal";
import type { ISnapshotTree } from "@fluidframework/driver-definitions/internal";
import { loggerToMonitoringContext } from "@fluidframework/telemetry-utils/internal";
import { wrapObjectAndOverride } from "@fluidframework/test-runtime-utils/internal";

import { SeedSummaryHost } from "./summaryHost.js";

/**
 * Runtime-only virtual snapshot and its complete content-addressed blob bodies.
 */
export interface MaterializedSnapshot {
	/** Native app-root tree; does not replace the loader's protocol or stored version. */
	readonly snapshot: ISnapshotTree;
	/** Every blob referenced by the generated tree. */
	readonly blobs: ReadonlyMap<string, ArrayBuffer>;
}

/**
 * Application-owned construction rules, supplied before ordinary runtime loading.
 * This local reference contract is not a published converter API.
 */
export interface SeedProjector {
	/** Stored native state must load normally instead of being reconstructed from old seed input. */
	isNative(context: IContainerContext): boolean;
	/** Read application content without changing the original snapshot or replaying operations. */
	readSeed(context: IContainerContext): Promise<unknown>;
	/** Build a deterministic complete graph at the source checkpoint, without live-client writes. */
	materialize(seed: unknown, sequenceNumber: number): MaterializedSnapshot;
}

/**
 * Inputs supplied to the application's existing native runtime construction.
 */
export interface SeedRuntimeLoad {
	/** True only when the original stored snapshot contained no native runtime state. */
	readonly fromSeed: boolean;
	/** The loader-owned context remains unmodified, including protocol, version and replay state. */
	readonly original: IContainerContext;
	/** Runtime-facing snapshot/storage overlay; pass this context to ordinary native loading. */
	readonly context: IContainerContext;
	/** The only supported way to request summaries from the corresponding summarizer. */
	readonly summaries: SeedSummaryHost;
}

/**
 * Adapt the runtime-facing context, then call the application's normal runtime constructor.
 *
 * Keep the application registry and entry point in the delegate, not in this adapter.
 * The delegate must disable automatic summaries and route host requests through the supplied
 * SeedSummaryHost. No callback preserves the seed root: native summaries replace creation input.
 * This reference uses test-internal forwarding and summary helpers; it is not a shipping SDK.
 */
export function seedRuntimeFactory(
	projector: SeedProjector,
	delegate: (load: SeedRuntimeLoad, existing: boolean) => Promise<IRuntime>,
	options: {
		/** Set false to prove that persisted native state loads without conversion or seed reads. */
		allowProjection?: boolean;
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
			const fromSeed = !projector.isNative(original);
			if (fromSeed && options.allowProjection === false)
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
				const input = await projector.readSeed(original);
				const materialized = projector.materialize(
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
			const runtime = await delegate({ fromSeed, original, context, summaries }, existing);
			return wrapObjectAndOverride(
				runtime,
				{
					getPendingLocalState: () => () => {
						throw new Error("Pending/offline capture is unsupported by the seed reference");
					},
				},
				{ receiver: "target" },
			);
		},
	};
}
