/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { hashFile, IsoBuffer } from "@fluid-internal/client-utils";
import { AttachState } from "@fluidframework/container-definitions";
import type {
	IContainer,
	IContainerContext,
	IFluidCodeDetails,
	IRuntime,
	IRuntimeFactory,
} from "@fluidframework/container-definitions/internal";
import { assert } from "@fluidframework/core-utils/internal";
import type { ISummaryTree } from "@fluidframework/driver-definitions";
import { SummaryType } from "@fluidframework/driver-definitions";
import type { ISnapshotTree } from "@fluidframework/driver-definitions/internal";
import {
	loggerToMonitoringContext,
	UsageError,
} from "@fluidframework/telemetry-utils/internal";

import { snapshotHasLoadingGroups } from "./captureReferencedContents.js";
import {
	createDetachedContainer,
	type IContainerHostProps,
} from "./createAndLoadContainerUtils.js";
import { combineAppAndProtocolSummary, convertSummaryToISnapshot } from "./utils.js";

/**
 * Complete native runtime state constructed from application-owned creation input.
 * @legacy @alpha
 */
export interface SeedRuntimeSnapshot {
	/**
	 * Runtime-root snapshot, without a protocol tree or an enclosing `.app` tree.
	 */
	readonly snapshot: ISnapshotTree;
	/**
	 * Contents of every blob referenced by the snapshot.
	 * These IDs are local to the materialization, not service upload handles.
	 * IDs must not collide with blobs in the stored snapshot or its fetched contents.
	 */
	readonly blobs: ReadonlyMap<string, ArrayBuffer>;
}

/**
 * Application-owned interpretation and deterministic construction of seed content.
 *
 * @remarks
 * Use the same registry, schema, graph IDs, construction session, and initialization order
 * on every client that loads a particular seed.
 * The format of the seed remains application-owned; no manifest is required.
 *
 * @typeParam TSeed - Validated application input returned by `readSeed` and consumed by `materialize`.
 * @legacy @alpha
 */
export interface SeedProjector<TSeed = unknown> {
	/**
	 * Identify stored native runtime state, including snapshots fetched after a summary.
	 * Inspect `context.baseSnapshot` without reading or modifying seed content.
	 */
	isNative(context: IContainerContext): boolean;
	/**
	 * Read and validate application-owned input from the original stored snapshot.
	 */
	readSeed(context: IContainerContext): Promise<TSeed>;
	/**
	 * Construct the complete native graph at checkpoint zero, without live writes.
	 * Use {@link createSeedRuntimeSnapshot} to serialize a real detached runtime.
	 */
	materialize(
		seed: TSeed,
		sequenceNumber: number,
	): SeedRuntimeSnapshot | Promise<SeedRuntimeSnapshot>;
}

/**
 * Context supplied to the application's normal runtime constructor.
 * @legacy @alpha
 */
export interface SeedRuntimeLoad {
	/**
	 * Whether this load materialized application input rather than loading stored native state.
	 * Configure the runtime's full-tree summary policy until its first acknowledged summary
	 * when this is true.
	 */
	readonly fromSeed: boolean;
	/**
	 * Original loader context, including the stored version, protocol, checkpoint, and replay state.
	 */
	readonly original: IContainerContext;
	/**
	 * Context to pass to the native runtime constructor.
	 * Its snapshot and storage consistently expose the materialized native state.
	 */
	readonly context: IContainerContext;
}

/**
 * Options for {@link seedRuntimeFactory}.
 * @legacy @alpha
 */
export interface SeedRuntimeFactoryOptions {
	/**
	 * Set to false to require a stored native snapshot and prohibit seed materialization.
	 * Native documents and ordinary detached creation are unaffected.
	 * @defaultValue `true`
	 */
	readonly allowProjection?: boolean;
}

/**
 * Adapt seed snapshots before invoking your application's native runtime constructor.
 *
 * @remarks
 * The loader keeps ownership of protocol state, the stored version, checkpoint, and operation replay.
 * Only the runtime-facing snapshot and storage are overlaid.
 * For a seed load, configure the runtime to produce complete summaries until the first native
 * summary is acknowledged (`summaryGenerationOptions.fullTreePolicy: "untilFirstAck"` in ContainerRuntime).
 * Do not copy seed content into native summaries.
 *
 * Seed loads currently require an attached version at checkpoint zero, immediate summary
 * acknowledgement refresh, and no pending state, offline mode, or loading groups.
 * These restrictions do not apply to native documents.
 *
 * @typeParam TSeed - Application input shared by the projector's reader and materializer.
 * @param projector - Application-owned seed interpretation and materialization.
 * @param delegate - Your normal runtime constructor, called after materialization completes.
 * @param options - Optional native-only loading policy.
 * @returns A factory for use by your code loader.
 * @legacy @alpha
 */
export function seedRuntimeFactory<TSeed = unknown>(
	projector: SeedProjector<TSeed>,
	delegate: (load: SeedRuntimeLoad, existing: boolean) => Promise<IRuntime>,
	options: SeedRuntimeFactoryOptions = {},
): IRuntimeFactory {
	return {
		get IRuntimeFactory() {
			return this;
		},
		async instantiateRuntime(original, existing) {
			if (!existing || original.baseSnapshot === undefined || projector.isNative(original)) {
				return delegate({ fromSeed: false, original, context: original }, existing);
			}
			if (options.allowProjection === false) {
				throw new UsageError("Native-only loader refuses a seed");
			}
			if (original.attachState !== AttachState.Attached) {
				throw new UsageError("Seed loading requires an attached container");
			}
			if (original.pendingLocalState !== undefined) {
				throw new UsageError("Pending/offline restoration is not supported for seed loading");
			}
			// Check before reading application data: replay cannot recover operations that a
			// nonzero checkpoint incorrectly claims are already included in pristine seed input.
			if (original.deltaManager.initialSequenceNumber !== 0) {
				throw new UsageError("Only the original creation checkpoint can be materialized");
			}
			const config = loggerToMonitoringContext(original.taggedLogger).config;
			if (
				original.clientDetails.capabilities.interactive &&
				(config.getBoolean("Fluid.Container.enableOfflineFull") ?? true)
			) {
				throw new UsageError("Offline loading is not supported for seed loading");
			}
			if (config.getBoolean("Fluid.Summarizer.immediatelyRefreshLatestSummaryAck") === false) {
				throw new UsageError("Seed loading requires immediate summary ACK refresh");
			}
			const sourceVersion = original.getLoadedFromVersion()?.id;
			if (sourceVersion === undefined) {
				throw new UsageError("Seed loading requires a stored snapshot version");
			}
			const source = original.baseSnapshot;
			if (snapshotHasLoadingGroups(source)) {
				throw new UsageError("Loading groups are unsupported for seed loading");
			}
			const materialized = await projector.materialize(await projector.readSeed(original), 0);
			validateSeedRuntimeSnapshot(materialized);
			validateBlobNamespaces(
				source,
				materialized.blobs,
				original.snapshotWithContents?.blobContents,
			);
			const snapshot: ISnapshotTree = {
				...source,
				// The original protocol remains loader-owned. Application input is not part
				// of the native runtime graph and must not survive into native summaries.
				blobs: { ...materialized.snapshot.blobs },
				trees: {
					...materialized.snapshot.trees,
					...(source.trees[".protocol"] === undefined
						? {}
						: { ".protocol": source.trees[".protocol"] }),
				},
			};
			const overlay = (
				fetched: ISnapshotTree,
				requestedVersion: string | undefined,
			): ISnapshotTree => {
				validateBlobNamespaces(fetched, materialized.blobs);
				if (projector.isNative(forwardWithOverrides(original, { baseSnapshot: fetched }))) {
					return fetched;
				}
				if (
					(requestedVersion !== undefined && requestedVersion !== sourceVersion) ||
					(source.id === undefined
						? requestedVersion !== sourceVersion
						: fetched.id !== source.id)
				) {
					throw new UsageError("Refetch of another seed version is unsupported");
				}
				return { ...fetched, blobs: snapshot.blobs, trees: snapshot.trees };
			};
			const storage = forwardWithOverrides(original.storage, {
				readBlob: async (id) => materialized.blobs.get(id) ?? original.storage.readBlob(id),
				getSnapshotTree: async (...args) => {
					const fetched = await original.storage.getSnapshotTree(...args);
					return fetched === null ? fetched : overlay(fetched, args[0]?.id);
				},
				getSnapshot:
					original.storage.getSnapshot === undefined
						? undefined
						: async (request) => {
								if ((request?.loadingGroupIds?.length ?? 0) > 0) {
									throw new UsageError("Loading groups are unsupported for seed loading");
								}
								const fetched = await original.storage.getSnapshot?.(request);
								if (fetched === undefined) {
									throw new UsageError("Snapshot service became unavailable");
								}
								validateBlobNamespaces(
									fetched.snapshotTree,
									materialized.blobs,
									fetched.blobContents,
								);
								const tree = overlay(fetched.snapshotTree, request?.versionId);
								if (
									tree !== fetched.snapshotTree &&
									fetched.sequenceNumber !== undefined &&
									fetched.sequenceNumber !== 0
								) {
									throw new UsageError(
										"Only the original creation checkpoint can be materialized",
									);
								}
								return tree === fetched.snapshotTree
									? fetched
									: {
											...fetched,
											snapshotTree: tree,
											blobContents: new Map([...fetched.blobContents, ...materialized.blobs]),
										};
							},
			});
			const context = forwardWithOverrides(original, {
				baseSnapshot: snapshot,
				storage,
				snapshotWithContents:
					original.snapshotWithContents === undefined
						? undefined
						: {
								...original.snapshotWithContents,
								snapshotTree: snapshot,
								blobContents: new Map([
									...original.snapshotWithContents.blobContents,
									...materialized.blobs,
								]),
							},
			});
			const runtime = await delegate({ fromSeed: true, original, context }, existing);
			return forwardWithOverrides(runtime, {
				getPendingLocalState: () => {
					throw new UsageError("Pending/offline capture is unsupported for seed loading");
				},
			});
		},
	};
}

/**
 * Construction settings for {@link createSeedRuntimeSnapshot}.
 * @legacy @alpha
 */
export interface CreateSeedRuntimeSnapshotProps
	extends Pick<IContainerHostProps, "scope" | "logger" | "configProvider"> {
	/**
	 * Factory for a real, detached application runtime.
	 * Configure deterministic construction IDs and initialize the same graph on every client.
	 * Do not reuse a construction compressor session in a live client.
	 */
	readonly runtimeFactory: IRuntimeFactory;
	/**
	 * Optional initialization after runtime creation and before serialization.
	 * Await all work that affects the snapshot.
	 * The container cannot attach and is disposed when this function completes.
	 */
	readonly initialize?: (container: IContainer) => Promise<void>;
	/**
	 * Code details used for the temporary detached container.
	 * These do not replace the externally produced document's code details.
	 */
	readonly codeDetails?: IFluidCodeDetails;
}

/**
 * Materialize complete native state using a real temporary detached container.
 *
 * @remarks
 * This helper uses ordinary runtime serialization, not a hand-written runtime format.
 * No driver or network access is needed. Service endpoints reject attempts to attach or load.
 * The temporary container is disposed on success or failure.
 * Attachment blobs, summary handles, and loading groups are not supported.
 * The result contains only runtime state; protocol state and operation replay remain loader-owned.
 *
 * @param props - Your construction runtime factory and optional initializer.
 * @returns Native runtime snapshot and all referenced blob contents.
 * @legacy @alpha
 */
export async function createSeedRuntimeSnapshot({
	runtimeFactory,
	initialize,
	codeDetails = { package: "seed-construction" },
	scope,
	logger,
	configProvider,
}: CreateSeedRuntimeSnapshotProps): Promise<SeedRuntimeSnapshot> {
	let runtime: IRuntime | undefined;
	const factory: IRuntimeFactory = {
		get IRuntimeFactory() {
			return this;
		},
		async instantiateRuntime(context, existing) {
			runtime = await runtimeFactory.instantiateRuntime(context, existing);
			return runtime;
		},
	};
	const rejectServiceAccess = async (): Promise<never> => {
		throw new UsageError("Seed construction cannot access a document service");
	};
	let container: IContainer | undefined;
	try {
		container = await createDetachedContainer({
			codeDetails,
			codeLoader: {
				load: async () => ({ module: { fluidExport: factory }, details: codeDetails }),
			},
			urlResolver: {
				resolve: rejectServiceAccess,
				getAbsoluteUrl: rejectServiceAccess,
			},
			documentServiceFactory: {
				createContainer: rejectServiceAccess,
				createDocumentService: rejectServiceAccess,
			},
			scope,
			logger,
			configProvider,
		});
		await initialize?.(container);
		if (
			container.attachState !== AttachState.Detached ||
			container.closed ||
			runtime === undefined
		) {
			throw new UsageError(
				"Seed construction must leave the temporary container detached and open",
			);
		}
		const summary = runtime.createSummary();
		validateCompleteSummary(summary);
		const converted = convertSummaryToISnapshot(summary);
		const blobs = new Map<string, ArrayBuffer>();
		const ids = new Map<string, string>();
		for (const [id, contents] of converted.blobContents) {
			// Content identities are local lookup keys, not persisted service handles.
			const localId = `seed:${await hashFile(IsoBuffer.from(contents), "SHA-256")}`;
			ids.set(id, localId);
			blobs.set(localId, contents);
		}
		const canonicalize = (tree: ISnapshotTree): ISnapshotTree => ({
			blobs: Object.fromEntries(
				Object.entries(tree.blobs).map(([key, id]) => {
					const localId = ids.get(id);
					assert(localId !== undefined, "Complete summary must supply every blob");
					return [key, localId];
				}),
			),
			trees: Object.fromEntries(
				Object.entries(tree.trees).map(([key, child]) => [key, canonicalize(child)]),
			),
			...(tree.unreferenced === undefined ? {} : { unreferenced: tree.unreferenced }),
		});
		const result = { snapshot: canonicalize(converted.snapshotTree), blobs };
		validateSeedRuntimeSnapshot(result);
		return result;
	} finally {
		try {
			container?.dispose();
		} finally {
			if (runtime !== undefined && !runtime.disposed) {
				// Construction can dispose the context before the container takes runtime ownership.
				runtime.dispose();
			}
		}
	}
}

/**
 * Inputs for {@link createSeedSummary}.
 * @legacy @alpha
 */
export interface CreateSeedSummaryProps {
	/**
	 * Code details identifying the application runtime that knows how to load this seed.
	 */
	readonly codeDetails: IFluidCodeDetails;
	/**
	 * Application-owned creation content to store under `.app`.
	 * Use your own paths and format. Only trees and blobs are supported.
	 */
	readonly applicationProjection: ISummaryTree;
}

/**
 * Create a checkpoint-zero document summary without constructing a runtime or data structures.
 *
 * @remarks
 * Pass the result to your driver's `IDocumentServiceFactory.createContainer`.
 * The helper writes protocol code details and stores your application content under `.app`.
 * It does not require a particular application format or create recurring projections.
 *
 * @param props - Application code details and seed content.
 * @returns A complete creation summary containing `.protocol` and `.app`.
 * @legacy @alpha
 */
export function createSeedSummary({
	codeDetails,
	applicationProjection,
}: CreateSeedSummaryProps): ISummaryTree {
	validateCompleteSummary(applicationProjection);
	if (applicationProjection.tree[".protocol"] !== undefined) {
		throw new UsageError("Application seed content must not contain a protocol tree");
	}
	const protocol: ISummaryTree = {
		type: SummaryType.Tree,
		tree: {
			attributes: {
				type: SummaryType.Blob,
				content: JSON.stringify({ sequenceNumber: 0, minimumSequenceNumber: 0 }),
			},
			quorumMembers: { type: SummaryType.Blob, content: "[]" },
			quorumProposals: { type: SummaryType.Blob, content: "[]" },
			quorumValues: {
				type: SummaryType.Blob,
				content: JSON.stringify([
					[
						"code",
						{
							key: "code",
							value: codeDetails,
							approvalSequenceNumber: 0,
							commitSequenceNumber: 0,
							sequenceNumber: 0,
						},
					],
				]),
			},
		},
	};
	return combineAppAndProtocolSummary(applicationProjection, protocol);
}

/**
 * Reject incomplete state before it can be used as the base of live operation replay.
 */
function validateSeedRuntimeSnapshot({ snapshot, blobs }: SeedRuntimeSnapshot): void {
	if (snapshot.trees[".protocol"] !== undefined || snapshot.trees[".app"] !== undefined) {
		throw new UsageError("Materialized state must contain only the native runtime root");
	}
	if (snapshotHasLoadingGroups(snapshot)) {
		throw new UsageError("Loading groups are unsupported for seed materialization");
	}
	const visit = (tree: ISnapshotTree): void => {
		for (const id of Object.values(tree.blobs)) {
			if (!blobs.has(id)) {
				throw new UsageError("Materialized state is missing a referenced blob");
			}
		}
		for (const child of Object.values(tree.trees)) {
			visit(child);
		}
	};
	visit(snapshot);
}

/**
 * Local materialization IDs must never shadow service blobs, including protocol contents.
 */
function validateBlobNamespaces(
	stored: ISnapshotTree,
	materialized: ReadonlyMap<string, ArrayBuffer>,
	storedContents?: ReadonlyMap<string, ArrayBuffer>,
): void {
	const check = (id: string): void => {
		if (materialized.has(id)) {
			throw new UsageError("Materialized blob IDs collide with stored snapshot blobs");
		}
	};
	const visit = (tree: ISnapshotTree): void => {
		for (const id of Object.values(tree.blobs)) {
			check(id);
		}
		for (const child of Object.values(tree.trees)) {
			visit(child);
		}
	};
	visit(stored);
	if (storedContents !== undefined) {
		for (const id of storedContents.keys()) {
			check(id);
		}
	}
}

/**
 * Only self-contained, eagerly available state can initialize a seed.
 */
function validateCompleteSummary(summary: ISummaryTree): void {
	if (summary.groupId !== undefined) {
		throw new UsageError("Loading groups are unsupported for seed construction");
	}
	for (const entry of Object.values(summary.tree)) {
		if (entry.type === SummaryType.Tree) {
			validateCompleteSummary(entry);
		} else if (entry.type !== SummaryType.Blob) {
			throw new UsageError("Seed construction requires complete trees and blobs");
		}
	}
}

/**
 * Forward context, storage, and runtime members with their original receiver.
 * The separate proxy target also supports frozen objects and native private fields.
 */
function forwardWithOverrides<T extends object>(source: T, overrides: Partial<T>): T {
	// The proxy implements T by forwarding reads rather than copying the source.
	// eslint-disable-next-line @typescript-eslint/consistent-type-assertions
	const target = {} as T;
	return new Proxy(target, {
		get: (_target, key): unknown => {
			if (Object.prototype.hasOwnProperty.call(overrides, key)) {
				return Reflect.get(overrides, key);
			}
			const value: unknown = Reflect.get(source, key, source);
			return typeof value === "function" ? value.bind(source) : value;
		},
		has: (_target, key) => key in overrides || key in source,
		ownKeys: () => [...new Set([...Reflect.ownKeys(source), ...Reflect.ownKeys(overrides)])],
		getOwnPropertyDescriptor: (_target, key) => {
			const descriptor =
				Object.getOwnPropertyDescriptor(overrides, key) ??
				Object.getOwnPropertyDescriptor(source, key);
			return descriptor === undefined ? undefined : { ...descriptor, configurable: true };
		},
	});
}
