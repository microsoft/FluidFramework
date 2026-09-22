/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "node:assert";

import {
	LoaderHeader,
	type IContainer,
	type IRuntimeFactory,
} from "@fluidframework/container-definitions/internal";
import { Loader } from "@fluidframework/container-loader/internal";
import type { SummaryGenerationContext } from "@fluidframework/container-runtime/internal";
import {
	SummaryType,
	type ISummaryTree,
	type SummaryObject,
} from "@fluidframework/driver-definitions";
import type { ISnapshotTree } from "@fluidframework/driver-definitions/internal";
import {
	createSummarizerCore,
	createTestConfigProvider,
	LoaderContainerTracker,
	LocalCodeLoader,
	summarizeNow,
	toIDeltaManagerFull,
	waitForContainerConnection,
} from "@fluidframework/test-utils/internal";

import {
	codeDetails,
	createSeedSummary,
	htmlPartIds,
	projectionGroup,
	projectionKey,
	readApplicationProjection,
	type HtmlPartId,
	type HtmlParts,
} from "./externalSeedFile.js";
import { HtmlElement, HtmlText, viewHtml, viewHtmlParts } from "./htmlTreeSchema.js";
import {
	sampleRuntimeFactory,
	type AppObservation,
	type HtmlEntryPoint,
} from "./sampleRuntimeFactory.js";
import { forward } from "./seedRuntimeAdapter.js";
import type { SeedWorkflowBackend } from "./seedWorkflowBackend.js";

export const exampleParts: HtmlParts = {
	first: '<div class="document"><p id="first">Hello</p></div>',
	second: '<div class="details"><p id="second">World</p></div>',
};

/** Select a known fixture paragraph, failing if loading or prior edits changed its expected structure. */
function paragraph(app: HtmlEntryPoint, part: HtmlPartId): HtmlElement {
	const root = app.view.root[part][0];
	assert(root instanceof HtmlElement);
	const result = root.children[0];
	assert(result instanceof HtmlElement);
	return result;
}

/** Select a fixture text node so concurrent and pending-edit tests mutate the actual collaborative DDS. */
function text(app: HtmlEntryPoint, part: HtmlPartId): HtmlText {
	const node = paragraph(app, part).children[0];
	assert(node instanceof HtmlText);
	return node;
}

/** Validate recursively that a seed-loaded runtime never references virtual native paths through handles. */
function assertFull(summary: ISummaryTree): void {
	for (const value of Object.values(summary.tree)) {
		assert.notEqual(
			value.type,
			SummaryType.Handle,
			"Virtual native summary paths must never be reused",
		);
		if (value.type === SummaryType.Tree) {
			assertFull(value);
		}
	}
}

/** Detect native handle reuse after graduation, proving the ordinary incremental-summary path remains enabled. */
function hasHandle(summary: ISummaryTree): boolean {
	return Object.values(summary.tree).some(
		(entry) =>
			entry.type === SummaryType.Handle ||
			(entry.type === SummaryType.Tree && hasHandle(entry)),
	);
}

/** Inspect the app callback output without rendering either part to infer reuse. */
function projectionSummary(summary: ISummaryTree): ISummaryTree {
	const subtree: SummaryObject | undefined = summary.tree[projectionKey];
	assert(subtree?.type === SummaryType.Tree);
	assert.equal(subtree.groupId, projectionGroup);
	return subtree;
}

/** Prove an unchanged part is a previous-summary subtree handle, not a freshly serialized equivalent blob. */
function assertReusedPart(summary: ISummaryTree, part: HtmlPartId): void {
	assert.deepEqual(projectionSummary(summary).tree[part], {
		type: SummaryType.Handle,
		handleType: SummaryType.Tree,
		handle: `/${projectionKey}/${part}`,
	});
}

/** Read one newly encoded part from the submission; reused handles deliberately cannot pass this assertion. */
function encodedPart(summary: ISummaryTree, part: HtmlPartId): string {
	const subtree: SummaryObject | undefined = projectionSummary(summary).tree[part];
	assert(subtree?.type === SummaryType.Tree);
	const blob: SummaryObject | undefined = subtree.tree["document.html"];
	assert(blob?.type === SummaryType.Blob && typeof blob.content === "string");
	return blob.content;
}

/** Collect persisted part blob IDs for cross-summary reuse checks without downloading either HTML body. */
function partBlobIds(snapshot: ISnapshotTree): Record<HtmlPartId, string> {
	const projection: ISnapshotTree | undefined = snapshot.trees[projectionKey];
	const first: string | undefined = projection?.trees.first?.blobs["document.html"];
	const second: string | undefined = projection?.trees.second?.blobs["document.html"];
	assert(
		first !== undefined && second !== undefined,
		"Both part IDs must survive snapshot loading",
	);
	return { first, second };
}

/** Test-only client orchestration and observations used by the lifecycle and pending-state scenarios. */
export interface SeedTestSession {
	/** Coordinates real client queues and waits for convergence, rather than mocking op delivery. */
	readonly tracker: LoaderContainerTracker;
	/** Completed native loads and their original/projected contexts, in load-observation order. */
	readonly observations: AppObservation[];
	/** Construct a loader, optionally forbidding materialization or seed-body reads during restore. */
	makeLoader(allowProjection?: boolean, denySeedBodyReads?: boolean): Loader;
	/** Enroll a container in synchronization and cleanup, including separately created summarizers. */
	track(container: IContainer): IContainer;
	/** Count submitted model/runtime batch messages to detect initialization writes merely on open. */
	readonly modelWrites: number;
	/** Count callback attempts, including failures and summaries that reuse native handles. */
	readonly projectionCalls: number;
	/** Summarizer checkpoint observed by the most recent application projection callback. */
	readonly projectionCheckpoint: number | undefined;
	/** Counts at the actual part serializer entry, excluding display/test-only comparisons. */
	readonly serializedParts: Readonly<Record<HtmlPartId, number>>;
	/** Contexts delivered to application summary generation, including effective full-tree policy. */
	readonly summaryContexts: readonly SummaryGenerationContext[];
	/** Wait until runtime/native/GC and captured projection state have adopted a particular storage version. */
	waitForSummaryAcceptance(version: string): Promise<void>;
	/** Make exactly the next projection callback throw before any upload is possible. */
	failNextProjection(): void;
	/** Open a file/version or restore pending state with a newly constructed loader. */
	load(
		url: string,
		allowProjection?: boolean,
		version?: string,
		pending?: string,
	): Promise<IContainer>;
	/** Dispose all tracked containers and coordination listeners, leaving backend shutdown to the caller. */
	close(): void;
}

/**
 * Create real client loaders plus test-only observations, queue coordination, and failure injection.
 * This harness measures write-on-open, projection checkpoints, and restoration; it does not simulate
 * storage or ACKs. Backend/auth/URL/server details remain outside this file. Always close the session.
 */
export function referenceSession(
	backend: SeedWorkflowBackend,
	useSnapshotApi = true,
): SeedTestSession {
	const tracker = new LoaderContainerTracker(true);
	const observations: AppObservation[] = [];
	const containers: IContainer[] = [];
	let modelWrites = 0;
	let failProjection = false;
	let projectionCalls = 0;
	let projectionCheckpoint: number | undefined;
	const serializedParts: Record<HtmlPartId, number> = { first: 0, second: 0 };
	const summaryContexts: SummaryGenerationContext[] = [];
	const acceptedVersions = new Set<string>();
	const acceptanceWaiters = new Map<string, () => void>();
	/** Wire the sample runtime to the backend, optionally denying source reads to prove offline reconstruction. */
	const makeLoader = (allowProjection = true, denySeedBodyReads = false): Loader => {
		const appFactory = sampleRuntimeFactory({
			allowProjection,
			observe: (observation) => observations.push(observation),
			beforeProjection: (checkpoint) => {
				projectionCalls++;
				projectionCheckpoint = checkpoint;
				if (failProjection) {
					failProjection = false;
					throw new Error("Injected projection failure before upload");
				}
			},
			onSerializePart: (part) => {
				serializedParts[part]++;
			},
			observeSummary: (context) => summaryContexts.push(context),
			onSummaryAccepted: (context) => {
				assert(context.ackHandle !== undefined);
				acceptedVersions.add(context.ackHandle);
				acceptanceWaiters.get(context.ackHandle)?.();
				acceptanceWaiters.delete(context.ackHandle);
			},
		});
		const factory: IRuntimeFactory = {
			get IRuntimeFactory() {
				return this;
			},
			instantiateRuntime: async (context, existing) =>
				appFactory.instantiateRuntime(
					forward(context, {
						storage:
							!denySeedBodyReads || context.pendingLocalState === undefined
								? context.storage
								: forward(context.storage, {
										readBlob: async (id) => {
											const projection: ISnapshotTree | undefined =
												context.baseSnapshot?.trees[projectionKey];
											const seedIds =
												projection === undefined
													? []
													: [
															...Object.values(projection.blobs),
															...Object.values(projection.trees).flatMap((part) =>
																Object.values(part.blobs),
															),
														];
											if (seedIds.includes(id)) {
												throw new Error(
													"Seed bodies unavailable during pending-state reconstruction",
												);
											}
											return context.storage.readBlob(id);
										},
									}),
						submitBatchFn: (batch, sequence) => {
							modelWrites += batch.length;
							return context.submitBatchFn(batch, sequence);
						},
					}),
					existing,
				),
		};
		return new Loader({
			documentServiceFactory: backend.documentServiceFactory,
			urlResolver: backend.urlResolver,
			codeLoader: new LocalCodeLoader([[codeDetails, factory]]),
			configProvider: createTestConfigProvider({
				"Fluid.Container.UseLoadingGroupIdForSnapshotFetch2": useSnapshotApi,
				"Fluid.Container.enableOfflineFull": true,
			}),
		});
	};
	/** Register interactive and summarizer containers for synchronization and deterministic cleanup. */
	const track = (container: IContainer): IContainer => {
		containers.push(container);
		tracker.addContainer(container);
		return container;
	};
	return {
		tracker,
		observations,
		makeLoader,
		track,
		get modelWrites(): number {
			return modelWrites;
		},
		get projectionCalls(): number {
			return projectionCalls;
		},
		get projectionCheckpoint(): number | undefined {
			return projectionCheckpoint;
		},
		serializedParts,
		summaryContexts,
		async waitForSummaryAcceptance(version): Promise<void> {
			if (acceptedVersions.has(version)) return;
			await new Promise<void>((resolve) => acceptanceWaiters.set(version, resolve));
		},
		/** Inject one callback failure so the workflow can verify abort-before-upload and a successful retry. */
		failNextProjection: (): void => {
			failProjection = true;
		},
		/** Load a chosen stored version or restore pending state through a new, independently constructed loader. */
		async load(
			url: string,
			allowProjection = true,
			version?: string,
			pending?: string,
		): Promise<IContainer> {
			return track(
				await makeLoader(allowProjection, pending !== undefined).resolve(
					{
						url,
						headers: version === undefined ? undefined : { [LoaderHeader.version]: version },
					},
					pending,
				),
			);
		},
		/** Dispose every tracked client and reset synchronization listeners without shutting down the backend. */
		close(): void {
			for (const container of containers) {
				if (!container.closed) container.close();
				container.dispose();
			}
			tracker.reset();
		},
	};
}

/**
 * Inspect a persisted seed or native summary independently of client overlays.
 * Validate app-only reading, retained blob IDs, optional initial body omission, and explicit group
 * retrieval at the same checkpoint. Only assert stronger storage behavior when the backend advertises it.
 */
async function verifyGroupedProjection(
	backend: SeedWorkflowBackend,
	url: string,
	version: string | undefined,
	expectedParts: HtmlParts,
): Promise<Record<HtmlPartId, string>> {
	const initial = await backend.inspect(url, version);
	try {
		const projectionTree: ISnapshotTree | undefined =
			initial.snapshot.snapshotTree.trees[projectionKey];
		assert(projectionTree !== undefined, "Persisted application projection must exist");
		if (backend.supportsLoadingGroups) assert.equal(projectionTree.groupId, projectionGroup);
		const ids = partBlobIds(initial.snapshot.snapshotTree);
		if (backend.omitsUnrequestedGroupBlobs) {
			for (const part of htmlPartIds) assert(!initial.snapshot.blobContents.has(ids[part]));
		}
		const projection = await readApplicationProjection(
			initial.snapshot.snapshotTree,
			initial.readBlob,
		);
		assert.deepEqual(projection.parts, expectedParts);
		if (!backend.supportsLoadingGroups) return ids;
		const grouped = await backend.inspect(url, version, [projectionGroup]);
		try {
			const groupedIds = partBlobIds(grouped.snapshot.snapshotTree);
			for (const part of htmlPartIds) {
				const bytes = grouped.snapshot.blobContents.get(groupedIds[part]);
				assert(
					bytes !== undefined,
					"Explicit group retrieval must return each part's contents",
				);
				assert.equal(Buffer.from(bytes).toString(), expectedParts[part]);
			}
			assert.equal(grouped.snapshot.sequenceNumber, initial.snapshot.sequenceNumber);
		} finally {
			grouped.dispose();
		}
		return ids;
	} finally {
		initial.dispose();
	}
}

/**
 * Exercise external creation, independent seed loads, concurrent editing, graduation, and native reload.
 * Validate no write-on-open, compatible genesis with distinct live sessions, real op convergence,
 * callback failure/retry and ACKed full summaries, same-checkpoint projections, and native handle reuse.
 * Storage creation, loaders, DDSs, sequencing, uploads, and ACKs are real; only observations and fault
 * injection are test harness code. Pass a fresh backend and close it after this workflow returns.
 */
export async function runReferenceWorkflow(backend: SeedWorkflowBackend): Promise<void> {
	const session = referenceSession(backend);
	try {
		const url = await backend.create(createSeedSummary(exampleParts));
		const seedInspection = await backend.inspect(url);
		const seedVersion = seedInspection.snapshot.snapshotTree.id;
		seedInspection.dispose();
		await verifyGroupedProjection(backend, url, seedVersion, exampleParts);
		const a = await session.load(url);
		const b = await session.load(url);
		await session.tracker.ensureSynchronized();
		const appA = (await a.getEntryPoint()) as HtmlEntryPoint;
		const appB = (await b.getEntryPoint()) as HtmlEntryPoint;
		assert.deepEqual(viewHtmlParts(appA.view), exampleParts);
		assert.deepEqual(viewHtmlParts(appB.view), exampleParts);
		assert.notEqual(appA.view.root.first, appA.view.root.second);
		assert.equal(
			session.modelWrites,
			0,
			"Opening a seed must not persist initialization/aliases/model ops",
		);
		assert.equal(backend.uploads.length, 0, "Opening a seed must not write a summary");
		const [obsA, obsB] = session.observations;
		assert(obsA.projected && obsB.projected);
		assert.equal(obsA.provenance?.fingerprint, obsB.provenance?.fingerprint);
		assert(appA.sessionId !== undefined && appB.sessionId !== undefined);
		assert.notEqual(appA.sessionId, appB.sessionId);
		assert.equal(obsA.original.baseSnapshot?.blobs[".metadata"], undefined);
		assert(obsA.context.baseSnapshot?.blobs[".metadata"]?.startsWith("projected:"));
		assert.equal(obsA.context.getLoadedFromVersion(), obsA.original.getLoadedFromVersion());
		assert.equal(obsA.context.deltaManager, obsA.original.deltaManager);
		assert.equal(obsA.context.clientId, obsA.original.clientId);
		const fetchedTree = await obsA.context.storage.getSnapshotTree(
			obsA.original.getLoadedFromVersion(),
		);
		assert(fetchedTree?.blobs[".metadata"]?.startsWith("projected:"));
		if (obsA.original.snapshotWithContents !== undefined) {
			assert(obsA.context.storage.getSnapshot !== undefined);
			const fetchedSnapshot = await obsA.context.storage.getSnapshot({});
			assert(
				fetchedSnapshot.blobContents.has(fetchedSnapshot.snapshotTree.blobs[".metadata"]),
			);
		}
		assert.equal(
			obsA.original.baseSnapshot?.blobs[".metadata"],
			undefined,
			"Refetch must not modify the loader base",
		);

		// Queue both edits before either client can observe the other's op.
		const queueA = toIDeltaManagerFull(a.deltaManager).outbound;
		const queueB = toIDeltaManagerFull(b.deltaManager).outbound;
		await Promise.all([queueA.pause(), queueB.pause()]);
		text(appA, "first").text = "Hello from A";
		text(appB, "second").text = "World from B";
		paragraph(appA, "first").children.insertAtEnd(new HtmlText({ text: " +A" }));
		paragraph(appB, "first").children.insertAtEnd(new HtmlText({ text: " +B" }));
		queueA.resume();
		queueB.resume();
		await session.tracker.ensureSynchronized();
		const merged = viewHtmlParts(appA.view);
		assert.deepEqual(viewHtmlParts(appB.view), merged);
		assert(merged.first.includes("Hello from A") && merged.second.includes("World from B"));
		assert(merged.first.includes("+A") && merged.first.includes("+B"));

		// This client loads the original seed plus real sequenced suffix, independently.
		const { container: summarizerContainer, summarizer } = await createSummarizerCore(
			a,
			session.makeLoader(),
			seedVersion,
		);
		session.track(summarizerContainer);
		await session.tracker.ensureSynchronized();
		const summarizerObservation = session.observations.at(-1);
		assert(summarizerObservation?.projected);
		assert.equal(summarizerObservation.provenance?.fingerprint, obsA.provenance?.fingerprint);
		assert.deepEqual(
			viewHtmlParts(summarizerObservation.app.view),
			merged,
			"Normal sequenced suffix must apply after projection",
		);
		session.failNextProjection();
		await assert.rejects(
			summarizeNow(summarizer, "injected failure"),
			/Injected projection failure/,
		);
		assert.equal(backend.uploads.length, 0, "Failed projection must abort before upload");
		let accepted = await summarizeNow(summarizer, "graduate the projected baseline");
		await session.waitForSummaryAcceptance(accepted.summaryVersion);
		assert.equal(backend.uploads[0].documentUrl, url);
		assert.equal(
			backend.uploads[0].context.ackHandle,
			summarizerObservation.original.getLoadedFromVersion()?.id,
			"First native summary must retain the real seed parent",
		);
		assert.equal(backend.uploads[0].context.referenceSequenceNumber, accepted.summaryRefSeq);
		assertFull(accepted.summaryTree);
		assert(
			accepted.summaryTree.tree.gc !== undefined,
			"Graduation must emit real GC state too",
		);
		for (const part of htmlPartIds)
			assert.equal(encodedPart(accepted.summaryTree, part), merged[part]);
		assert.equal(session.summaryContexts.at(-1)?.fullTree, true);
		assert.deepEqual(session.serializedParts, { first: 1, second: 1 });
		assert.equal(
			accepted.summaryRefSeq,
			session.projectionCheckpoint,
			"Projection must be produced at the summarizer's own checkpoint",
		);
		const firstNativeIds = await verifyGroupedProjection(
			backend,
			url,
			accepted.summaryVersion,
			merged,
		);

		// The SAME seed-loaded runtime adopts its first native ACK and now reuses unchanged state.
		const firstNativeVersion = accepted.summaryVersion;
		accepted = await summarizeNow(
			summarizer,
			"incremental immediately after first native ACK",
		);
		await session.waitForSummaryAcceptance(accepted.summaryVersion);
		assert.equal(session.summaryContexts.at(-1)?.fullTree, false);
		assert.equal(
			session.summaryContexts.at(-1)?.previousSummary?.ackHandle,
			firstNativeVersion,
		);
		for (const part of htmlPartIds) assertReusedPart(accepted.summaryTree, part);
		assert.deepEqual(session.serializedParts, { first: 1, second: 1 });
		const unchangedChannels: SummaryObject | undefined =
			accepted.summaryTree.tree[".channels"];
		assert(
			unchangedChannels?.type === SummaryType.Tree && hasHandle(unchangedChannels),
			"Second summary from the original seed runtime must reuse native handles",
		);
		assert.deepEqual(
			await verifyGroupedProjection(backend, url, accepted.summaryVersion, merged),
			firstNativeIds,
			"Unchanged HTML must retain the actual stored blob IDs",
		);

		// Only the first part changes. The second subtree must bypass its serializer and upload entirely.
		text(appA, "first").text = "Only first part changes";
		await session.tracker.ensureSynchronized();
		const editedParts = viewHtmlParts(appA.view);
		assert.equal(editedParts.second, merged.second);
		const previousVersion = accepted.summaryVersion;
		accepted = await summarizeNow(summarizer, "encode only the changed HTML part");
		await session.waitForSummaryAcceptance(accepted.summaryVersion);
		assert.equal(session.summaryContexts.at(-1)?.fullTree, false);
		assert.equal(session.summaryContexts.at(-1)?.previousSummary?.ackHandle, previousVersion);
		assert.equal(encodedPart(accepted.summaryTree, "first"), editedParts.first);
		assertReusedPart(accepted.summaryTree, "second");
		assert.deepEqual(session.serializedParts, { first: 2, second: 1 });
		const submitted = backend.uploads.at(-1);
		assert(submitted !== undefined);
		assert.equal(submitted.context.ackHandle, previousVersion);
		assertReusedPart(submitted.summary, "second");
		const editedIds = await verifyGroupedProjection(
			backend,
			url,
			accepted.summaryVersion,
			editedParts,
		);
		assert.notEqual(editedIds.first, firstNativeIds.first);
		assert.equal(
			editedIds.second,
			firstNativeIds.second,
			"Reusing the second subtree must preserve its stored HTML blob ID",
		);

		// Another accepted parent must carry forward the reusable paths without re-rendering either part.
		accepted = await summarizeNow(
			summarizer,
			"reuse both parts against the new accepted parent",
		);
		await session.waitForSummaryAcceptance(accepted.summaryVersion);
		for (const part of htmlPartIds) assertReusedPart(accepted.summaryTree, part);
		assert.deepEqual(session.serializedParts, { first: 2, second: 1 });
		assert.deepEqual(
			await verifyGroupedProjection(backend, url, accepted.summaryVersion, editedParts),
			editedIds,
		);

		// No materialization fallback: this must be an entirely normal native load.
		const fresh = await session.load(url, false, accepted.summaryVersion);
		const freshApp = (await fresh.getEntryPoint()) as HtmlEntryPoint;
		await session.tracker.ensureSynchronized();
		assert.deepEqual(viewHtmlParts(freshApp.view), editedParts);
		assert.equal(session.observations.at(-1)?.projected, false);
		assert.equal(
			session.observations
				.at(-1)
				?.context.baseSnapshot?.blobs[".metadata"]?.startsWith("projected:"),
			false,
		);

		// A new native-loaded summarizer has normal incremental policy, but the
		// app projection callback must still run on every attempt/checkpoint.
		summarizer.close();
		summarizerContainer.close();
		text(freshApp, "second").text = "Native follow-up";
		await session.tracker.ensureSynchronized(a, b, fresh);
		const native = await createSummarizerCore(
			fresh,
			session.makeLoader(false),
			accepted.summaryVersion,
		);
		session.track(native.container);
		await session.tracker.ensureSynchronized(a, b, fresh, native.container);
		const refreshed = await summarizeNow(native.summarizer, "refresh readable projection");
		await session.waitForSummaryAcceptance(refreshed.summaryVersion);
		const nativeParts = viewHtmlParts(freshApp.view);
		for (const part of htmlPartIds)
			assert.equal(encodedPart(refreshed.summaryTree, part), nativeParts[part]);
		assert.equal(session.summaryContexts.at(-1)?.fullTree, false);
		await verifyGroupedProjection(backend, url, refreshed.summaryVersion, nativeParts);
		// No content changes: native descendants can be handles; app output still exists.
		const callsBeforeRepeat = session.projectionCalls;
		const serializedBeforeRepeat = { ...session.serializedParts };
		const repeated = await summarizeNow(native.summarizer, "repeat without native changes");
		await session.waitForSummaryAcceptance(repeated.summaryVersion);
		assert.equal(session.projectionCalls, callsBeforeRepeat + 1);
		assert.deepEqual(session.serializedParts, serializedBeforeRepeat);
		for (const part of htmlPartIds) assertReusedPart(repeated.summaryTree, part);
		await verifyGroupedProjection(backend, url, repeated.summaryVersion, nativeParts);
		const channels: SummaryObject | undefined = repeated.summaryTree.tree[".channels"];
		assert(
			channels?.type === SummaryType.Tree && hasHandle(channels),
			"Fresh native runtimes should retain normal native handle reuse",
		);
	} finally {
		session.close();
	}
}

/**
 * Load two seed clients, disconnect one, save its pending edit, and reconstruct it in a fresh loader.
 * Deny retained seed-body storage reads during restoration to prove source dependencies, not virtual
 * blobs or a live version object, suffice. Validate the same fingerprint, normal replay, and convergence.
 * Cover both initial snapshot APIs; the loader's restored representation is ISnapshot in either case.
 */
export async function runPendingRestoreWorkflow(
	backend: SeedWorkflowBackend,
	useSnapshotApi = true,
): Promise<void> {
	const session = referenceSession(backend, useSnapshotApi);
	try {
		const url = await backend.create(createSeedSummary(exampleParts));
		const a = await session.load(url);
		const b = await session.load(url);
		await session.tracker.ensureSynchronized();
		const app = (await a.getEntryPoint()) as HtmlEntryPoint;
		const fingerprint = session.observations[0].provenance?.fingerprint;
		assert.equal(
			session.observations[0].original.snapshotWithContents !== undefined,
			useSnapshotApi,
		);
		a.disconnect();
		text(app, "first").text = "Pending edit";
		assert(a.getPendingLocalState !== undefined);
		const pending = await a.getPendingLocalState();
		assert(pending !== undefined);
		assert(
			!pending.includes("projected:"),
			"Virtual blob overlay must not leak into loader serialization",
		);
		a.close();
		a.dispose();
		const restored = await session.load(url, true, undefined, pending);
		await waitForContainerConnection(restored);
		await session.tracker.ensureSynchronized(b, restored);
		const restoredApp = (await restored.getEntryPoint()) as HtmlEntryPoint;
		assert.equal(
			viewHtml(restoredApp.view),
			viewHtml(((await b.getEntryPoint()) as HtmlEntryPoint).view),
		);
		assert(viewHtml(restoredApp.view).includes("Pending edit"));
		const observation = session.observations.find(
			(item) => item.original.pendingLocalState !== undefined,
		);
		assert(observation?.original.snapshotWithContents !== undefined);
		assert.equal(
			observation.original.getLoadedFromVersion(),
			undefined,
			"Restoration must not depend on a retained live version object",
		);
		assert.equal(observation.provenance?.fingerprint, fingerprint);
	} finally {
		session.close();
	}
}
