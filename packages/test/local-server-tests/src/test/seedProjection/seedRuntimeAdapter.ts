/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import type {
	IContainerContext,
	IRuntime,
	IRuntimeFactory,
} from "@fluidframework/container-definitions/internal";
import {
	MessageType,
	type ISnapshot,
	type ISnapshotTree,
} from "@fluidframework/driver-definitions/internal";

import type { ApplicationProjection } from "./externalSeedFile.js";
import type { NativeBaseline } from "./nativeSeedBaseline.js";
import {
	createSeedBaselineDescriptor,
	readSeedBaselineDescriptor,
	SeedBaselineMismatchError,
	SeedBaselineProtocol,
	type RetainedSeedBaseline,
	type SeedBaselineDescriptor,
} from "./seedBaselineFingerprint.js";

/**
 * Forward getters against their real owner and bind methods to that owner.
 * A spread of ContainerContext loses prototype getters and snapshots live state.
 * The proxy target is an empty forwarding facade, so frozen source properties
 * do not impose Proxy get-invariant restrictions on the overrides.
 */
export function forward<T extends object>(source: T, overrides: Partial<T>): T {
	return new Proxy(Object.create(null) as T, {
		get: (_target, key): unknown => {
			if (Object.hasOwn(overrides, key)) {
				const override: unknown = Reflect.get(overrides, key);
				return override;
			}
			const value: unknown = Reflect.get(source, key, source);
			const forwarded: unknown = typeof value === "function" ? value.bind(source) : value;
			return forwarded;
		},
		has: (_target, key): boolean => key in overrides || key in source,
	});
}

/** Reconstruction identity retained with pending state to detect a different source or codec. */
export interface Provenance {
	/** Versioned application format identifying the materialization rules. */
	format: string;
	/** Original persisted snapshot version, when the loader exposes one. */
	sourceVersion?: string;
	/** Source checkpoint before the loader applies the sequenced operation suffix. */
	sourceSequenceNumber: number;
	/** NativeBaseline's 64-hex SHA-256 identity; diagnostic, not a consensus protocol. */
	fingerprint: string;
}

/** Runtime-owned pending-state envelope; loader caches keep their original, unprojected snapshot. */
interface PendingProjection {
	/** Version discriminator separating this envelope from ordinary runtime pending state. */
	type: "seed-projection-pending/1";
	/** Expected materialization identity when the previous runtime loaded a seed. */
	provenance?: Provenance;
	/** Source bytes needed when a restored loader snapshot omitted the projection's blob bodies. */
	seed?: ApplicationProjection;
	/** Agreement identity is retained even when pending operations were captured before transport stamping. */
	baseline?: SeedBaselineDescriptor;
	/** Native-summary descriptor bytes, bound to their source blob ID for offline restoration. */
	retainedBaseline?: RetainedSeedBaseline;
	/** Loaded source checkpoint/version, separate from genesis identity; version may be unavailable from a driver. */
	loadedFrom?: { version?: string; sequenceNumber: number };
	/** Native runtime pending state, forwarded unchanged to the delegated runtime. */
	runtime: unknown;
}

/** Recognize the reference envelope before unwrapping native pending state for runtime loading. */
function isPendingProjection(value: unknown): value is PendingProjection {
	return (
		typeof value === "object" &&
		value !== null &&
		"type" in value &&
		value.type === "seed-projection-pending/1"
	);
}

/**
 * Application-owned codec used by seedRuntimeFactory before normal native runtime loading.
 * This reference uses an HTML payload; this is not a proposed generic SDK codec interface.
 */
export interface Projector {
	/** Versioned format governing accepted seed input and deterministic construction. */
	format: string;
	/** Recognize native state that must load normally rather than being regenerated from a projection. */
	isNative(context: IContainerContext): boolean;
	/** Read source bytes, optionally reusing retained bytes whose persisted blob IDs still match. */
	readSeed(
		context: IContainerContext,
		retained?: ApplicationProjection,
	): Promise<ApplicationProjection>;
	/** Pure deterministic materialization for fixed seed/checkpoint/codec; never replay ops or allocate live sessions. */
	materialize(seed: ApplicationProjection, sequenceNumber: number): NativeBaseline;
}

/** Both context views and the decision handed to the application's native runtime factory. */
export interface ProjectionLoad {
	/** Actual loader-owned context; its source snapshot, checkpoint, storage identity, and ops remain unchanged. */
	original: IContainerContext;
	/** Runtime-facing context, with a coherent native snapshot/storage overlay only when projection was needed. */
	context: IContainerContext;
	/** Whether this runtime materialized a seed and needs full native state until its first tracked summary ACK. */
	projected: boolean;
	/** Reconstruction identity retained or produced by this load, when available. */
	provenance?: Provenance;
	/** Immutable genesis agreement, computed for a seed or read from a native summary sidecar. */
	baseline?: SeedBaselineDescriptor;
}

/**
 * Wrap an application runtime factory so it can load an external seed as coherent native state.
 * Read and deterministically materialize application bytes before invoking the native delegate;
 * forward real context behavior while overlaying only runtime-facing snapshots and blob reads.
 * This adapter neither imports ContainerRuntime nor changes loader caches, protocol, checkpoint,
 * version, or pending replay order. The optional packet protocol validates before native op handling.
 * Pending restoration rebuilds the same overlay and verifies the retained agreement identity.
 * The delegate must enforce full structural summaries until a projected load adopts a tracked native summary.
 */
export function seedRuntimeFactory(
	projector: Projector,
	delegate: (load: ProjectionLoad, existing: boolean) => Promise<IRuntime>,
	options: {
		/** Set false to prove native reload works without a seed-materialization fallback. */
		allowProjection?: boolean;
		/** Test observation hook after adaptation and before invoking the native runtime factory. */
		observe?: (load: ProjectionLoad, original: IContainerContext) => void;
		/** Opt into the reference packet protocol; the sample factory always enables it. */
		enforceBaselineFingerprint?: boolean;
		/** Receive mismatch evidence and captured pending runtime work before the container closes. */
		onFingerprintMismatch?: (failure: SeedBaselineMismatchError) => void;
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
			let seed: ApplicationProjection | undefined;
			let baselineDescriptor: SeedBaselineDescriptor | undefined;
			let retainedBaseline: RetainedSeedBaseline | undefined;
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
				if (options.enforceBaselineFingerprint === true) {
					baselineDescriptor = createSeedBaselineDescriptor(
						seed,
						provenance.sourceSequenceNumber,
						provenance.format,
						provenance.fingerprint,
					);
				}
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
				const getSnapshot = original.storage.getSnapshot?.bind(original.storage);
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
						getSnapshot === undefined
							? undefined
							: async (fetchOptions) => {
									const source = await getSnapshot(fetchOptions);
									// Native DDSs in this fixture are ungrouped. A group-specific response
									// is an app-owned sidecar fetch, potentially a stripped tree, NOT a
									// replacement native base. Never overwrite it with the initial tree.
									const loadingGroupIds = fetchOptions?.loadingGroupIds;
									if (
										loadingGroupIds !== undefined &&
										loadingGroupIds.length > 0 &&
										!loadingGroupIds.includes("")
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
			if (options.enforceBaselineFingerprint === true && !projected) {
				retainedBaseline = await readSeedBaselineDescriptor(
					original.baseSnapshot,
					original.storage.readBlob.bind(original.storage),
					pending?.retainedBaseline,
				);
				baselineDescriptor = retainedBaseline.descriptor;
				if (baselineDescriptor.profileVersion !== projector.format) {
					throw new Error("Unsupported persisted seed baseline profile");
				}
			}
			const protocol =
				baselineDescriptor === undefined
					? undefined
					: new SeedBaselineProtocol(baselineDescriptor);
			if (protocol !== undefined) {
				if (original.pendingLocalState !== undefined) {
					// Do not silently reinterpret stashed native operations under another genesis.
					// Raw native state or an unknown wrapper has no verifiable agreement either.
					try {
						protocol.validateProof(pending?.baseline);
					} catch (error) {
						if (error instanceof SeedBaselineMismatchError) {
							error.pendingLocalState = original.pendingLocalState;
							options.onFingerprintMismatch?.(error);
						}
						throw error;
					}
				}
				// Preserve capability detection: older loaders must retain the native submitFn fallback.
				if (original.submitBatchFn !== undefined) {
					context = forward(context, {
						submitBatchFn: (batch, sequenceNumber) =>
							original.submitBatchFn(protocol.stampBatch(batch), sequenceNumber),
					});
				}
				context = forward(context, {
					submitFn: (type, contents, batch, appData) => {
						const metadata: unknown = appData;
						if (type !== MessageType.Operation) {
							return original.submitFn(type, contents, batch, appData);
						}
						if (
							metadata !== undefined &&
							(typeof metadata !== "object" || metadata === null || Array.isArray(metadata))
						) {
							throw new Error("Runtime operation metadata must be an object");
						}
						return original.submitFn(
							type,
							contents,
							batch,
							protocol.stampMetadata(metadata as Record<string, unknown> | undefined),
						);
					},
				});
			}
			const load: ProjectionLoad = {
				original,
				context,
				projected,
				provenance,
				baseline: baselineDescriptor,
			};
			options.observe?.(load, original);
			const runtime = await delegate(load, existing);
			const loadedFrom =
				protocol === undefined
					? undefined
					: {
							version: original.getLoadedFromVersion()?.id,
							sequenceNumber: original.deltaManager.initialSequenceNumber,
						};
			// Generated overlays are intentionally not serialized. Only source dependencies
			// omitted from the loader's initial ISnapshot are retained for reconstruction.
			const capturePending: IRuntime["getPendingLocalState"] = (props): PendingProjection => ({
				type: "seed-projection-pending/1",
				provenance,
				seed,
				baseline: baselineDescriptor,
				retainedBaseline,
				loadedFrom,
				runtime: runtime.getPendingLocalState(props),
			});
			let rejected: SeedBaselineMismatchError | undefined;
			return forward(runtime, {
				getPendingLocalState: capturePending,
				process: (message, local) => {
					if (rejected !== undefined) throw rejected;
					try {
						protocol?.validateMessage(message);
					} catch (error) {
						if (!(error instanceof SeedBaselineMismatchError)) throw error;
						rejected = error;
						// Use the existing runtime connection contract to stop transmission before
						// pending-state capture flushes a not-yet-flushed local batch. Close follows
						// synchronously; this does not reach into a loader's private outbound queue.
						try {
							runtime.setConnectionState(false, original.clientId);
							error.pendingLocalState = capturePending();
						} catch (captureError) {
							error.pendingCaptureError = captureError;
						}
						try {
							options.onFingerprintMismatch?.(error);
						} finally {
							// Close, not dispose: the entry point remains readable for explicit user-work export.
							original.closeFn(error);
						}
						throw error;
					}
					runtime.process(message, local);
				},
			});
		},
	};
}
