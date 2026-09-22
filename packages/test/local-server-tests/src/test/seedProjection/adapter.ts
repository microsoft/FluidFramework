/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import type {
	IContainerContext,
	IRuntime,
	IRuntimeFactory,
} from "@fluidframework/container-definitions/internal";
import type { ISnapshot, ISnapshotTree } from "@fluidframework/driver-definitions/internal";

import type { NativeBaseline } from "./baseline.js";

/**
 * Forward getters against their real owner and bind methods to that owner.
 * A spread of ContainerContext loses prototype getters and snapshots live state.
 * The proxy target is an empty forwarding facade, so frozen source properties
 * do not impose Proxy get-invariant restrictions on the overrides.
 */
export function forward<T extends object>(source: T, overrides: Partial<T>): T {
	return new Proxy(Object.create(null) as T, {
		get: (_target, key) => {
			if (Object.hasOwn(overrides, key)) {
				return Reflect.get(overrides, key);
			}
			const value: unknown = Reflect.get(source, key, source);
			return typeof value === "function" ? value.bind(source) : value;
		},
		has: (_target, key) => key in overrides || key in source,
	});
}

export interface SeedInput {
	/** Original persisted IDs bind retained bytes to this source snapshot. */
	manifestId: string;
	htmlId: string;
	manifest: string;
	html: string;
}

export interface Provenance {
	format: string;
	sourceVersion?: string;
	sourceSequenceNumber: number;
	fingerprint: string;
}

interface PendingProjection {
	type: "seed-projection-pending/1";
	provenance?: Provenance;
	seed?: SeedInput;
	runtime: unknown;
}

function isPendingProjection(value: unknown): value is PendingProjection {
	return (
		typeof value === "object" &&
		value !== null &&
		"type" in value &&
		value.type === "seed-projection-pending/1"
	);
}

export interface Projector {
	format: string;
	isNative(context: IContainerContext): boolean;
	readSeed(context: IContainerContext, retained?: SeedInput): Promise<SeedInput>;
	materialize(seed: SeedInput, sequenceNumber: number): NativeBaseline;
}

export interface ProjectionLoad {
	original: IContainerContext;
	context: IContainerContext;
	projected: boolean;
	provenance?: Provenance;
}

/**
 * Factory-level adapter. It neither imports ContainerRuntime nor changes loader
 * caches, protocol, checkpoint, version, op handling, or pending replay order.
 */
export function seedRuntimeFactory(
	projector: Projector,
	delegate: (load: ProjectionLoad, existing: boolean) => Promise<IRuntime>,
	options: {
		allowProjection?: boolean;
		observe?: (load: ProjectionLoad, original: IContainerContext) => void;
	} = {},
): IRuntimeFactory {
	return {
		get IRuntimeFactory() {
			return this;
		},
		async instantiateRuntime(original, existing) {
			if (!existing || original.baseSnapshot === undefined) {
				throw new Error("This reference factory only loads externally created documents");
			}
			const pending = isPendingProjection(original.pendingLocalState)
				? original.pendingLocalState
				: undefined;
			let context = forward(original, {
				pendingLocalState:
					pending === undefined ? original.pendingLocalState : pending.runtime,
			});
			let provenance = pending?.provenance;
			let seed: SeedInput | undefined;
			const projected = !projector.isNative(original);
			if (projected) {
				if (options.allowProjection === false) {
					throw new Error("Native-only client refuses an application seed");
				}
				seed = await projector.readSeed(original, pending?.seed);
				const baseline = projector.materialize(
					seed,
					original.deltaManager.initialSequenceNumber,
				);
				if (
					provenance !== undefined &&
					(provenance.fingerprint !== baseline.fingerprint ||
						provenance.format !== projector.format)
				) {
					throw new Error("Pending state genesis fingerprint or projector version mismatch");
				}
				provenance = {
					format: projector.format,
					sourceVersion: original.getLoadedFromVersion()?.id ?? provenance?.sourceVersion,
					sourceSequenceNumber: original.deltaManager.initialSequenceNumber,
					fingerprint: baseline.fingerprint,
				};
				const virtualBlobs = new Map(baseline.blobs);
				// Preserve the complete original envelope, including protocol and app provenance.
				const projectTree = (
					source: ISnapshotTree,
					projectedBase: NativeBaseline,
				): ISnapshotTree => ({
					...source,
					blobs: { ...source.blobs, ...projectedBase.snapshot.blobs },
					trees: { ...source.trees, ...projectedBase.snapshot.trees },
				});
				const projectFetched = async (
					source: ISnapshotTree,
					sequenceNumber: number,
				): Promise<ISnapshotTree> => {
					const fetchedContext = forward(original, { baseSnapshot: source });
					if (projector.isNative(fetchedContext)) {
						return source;
					}
					const fetchedSeed = await projector.readSeed(fetchedContext);
					const fetchedBaseline = projector.materialize(fetchedSeed, sequenceNumber);
					for (const [id, bytes] of fetchedBaseline.blobs) virtualBlobs.set(id, bytes);
					return projectTree(source, fetchedBaseline);
				};
				const baseSnapshot = projectTree(original.baseSnapshot, baseline);
				const storage = forward(original.storage, {
					readBlob: async (id) => virtualBlobs.get(id) ?? original.storage.readBlob(id),
					getSnapshotTree: async (...args) => {
						const source = await original.storage.getSnapshotTree(...args);
						if (
							source === null ||
							projector.isNative(forward(original, { baseSnapshot: source }))
						)
							return source;
						const attributesId = source.trees[".protocol"]?.blobs.attributes;
						if (attributesId === undefined)
							throw new Error("Cannot project a snapshot without its protocol checkpoint");
						const attributes = JSON.parse(
							Buffer.from(await original.storage.readBlob(attributesId)).toString(),
						) as { sequenceNumber: number };
						return projectFetched(source, attributes.sequenceNumber);
					},
					getSnapshot:
						original.storage.getSnapshot === undefined
							? undefined
							: async (fetchOptions) => {
									const source = await original.storage.getSnapshot!(fetchOptions);
									// Native DDSs in this fixture are ungrouped. A group-specific response
									// is an app-owned sidecar fetch, potentially a stripped tree, NOT a
									// replacement native base. Never overwrite it with the initial tree.
									if (
										fetchOptions?.loadingGroupIds?.length &&
										!fetchOptions.loadingGroupIds.includes("")
									)
										return source;
									if (
										projector.isNative(
											forward(original, { baseSnapshot: source.snapshotTree }),
										)
									)
										return source;
									if (source.sequenceNumber === undefined)
										throw new Error("Cannot project a snapshot without its checkpoint");
									const snapshotTree = await projectFetched(
										source.snapshotTree,
										source.sequenceNumber,
									);
									return snapshotTree === source.snapshotTree
										? source
										: {
												...source,
												snapshotTree,
												blobContents: new Map([...source.blobContents, ...virtualBlobs]),
											};
								},
				});
				// Restore uses ISnapshot even when the original load used getSnapshotTree.
				// Never present original blobContents alongside a projected tree alone.
				const snapshotWithContents: ISnapshot | undefined =
					original.snapshotWithContents === undefined
						? undefined
						: {
								...original.snapshotWithContents,
								snapshotTree: baseSnapshot,
								blobContents: new Map([
									...original.snapshotWithContents.blobContents,
									...baseline.blobs,
								]),
							};
				context = forward(context, { baseSnapshot, snapshotWithContents, storage });
			}
			const load: ProjectionLoad = { original, context, projected, provenance };
			options.observe?.(load, original);
			const runtime = await delegate(load, existing);
			// Generated overlays are intentionally not serialized. Only source dependencies
			// omitted from the loader's initial ISnapshot are retained for reconstruction.
			return forward(runtime, {
				getPendingLocalState: (props): PendingProjection => ({
					type: "seed-projection-pending/1",
					provenance,
					seed,
					runtime: runtime.getPendingLocalState(props),
				}),
			});
		},
	};
}
