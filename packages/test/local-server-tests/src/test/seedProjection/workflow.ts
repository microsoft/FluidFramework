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
import { SummaryType, type ISummaryTree } from "@fluidframework/driver-definitions";
import {
	createSummarizerCore,
	createTestConfigProvider,
	LoaderContainerTracker,
	LocalCodeLoader,
	summarizeNow,
	toIDeltaManagerFull,
	waitForContainerConnection,
} from "@fluidframework/test-utils/internal";

import { forward } from "./adapter.js";
import {
	applicationFactory,
	type AppObservation,
	type HtmlEntryPoint,
} from "./application.js";
import type { ReferenceBackend } from "./backend.js";
import { codeDetails, externalSeed, projectionGroup, projectionKey } from "./baseline.js";
import { HtmlElement, HtmlText, viewHtml } from "./html.js";

export const exampleHtml =
	'<div class="document"><p id="first">Hello</p><p id="second">World</p></div>';

function paragraph(app: HtmlEntryPoint, index: number): HtmlElement {
	const root = app.view.root[0];
	assert(root instanceof HtmlElement);
	const result = root.children[index];
	assert(result instanceof HtmlElement);
	return result;
}

function text(app: HtmlEntryPoint, index: number): HtmlText {
	const node = paragraph(app, index).children[0];
	assert(node instanceof HtmlText);
	return node;
}

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

function hasHandle(summary: ISummaryTree): boolean {
	return Object.values(summary.tree).some(
		(entry) =>
			entry.type === SummaryType.Handle ||
			(entry.type === SummaryType.Tree && hasHandle(entry)),
	);
}

function summaryHtml(summary: ISummaryTree): string {
	const subtree = summary.tree[projectionKey];
	assert.equal(subtree.type, SummaryType.Tree);
	assert(subtree.type === SummaryType.Tree);
	assert.equal(subtree.groupId, projectionGroup);
	const content = subtree.tree["document.html"];
	assert(content.type === SummaryType.Blob);
	assert.equal(typeof content.content, "string");
	return content.content as string;
}

/** Common client plumbing; backend/auth/URL/server details remain outside this file. */
export function referenceSession(backend: ReferenceBackend, useSnapshotApi = true) {
	const tracker = new LoaderContainerTracker(true);
	const observations: AppObservation[] = [];
	const containers: IContainer[] = [];
	let modelWrites = 0;
	let failProjection = false;
	let projectionCalls = 0;
	let projectionCheckpoint: number | undefined;
	const makeLoader = (allowProjection = true, denySeedBodyReads = false): Loader => {
		const appFactory = applicationFactory({
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
		});
		const factory: IRuntimeFactory = {
			get IRuntimeFactory() {
				return this;
			},
			instantiateRuntime: (context, existing) =>
				appFactory.instantiateRuntime(
					forward(context, {
						storage:
							!denySeedBodyReads || context.pendingLocalState === undefined
								? context.storage
								: forward(context.storage, {
										readBlob: async (id) => {
											if (
												Object.values(
													context.baseSnapshot?.trees[projectionKey]?.blobs ?? {},
												).includes(id)
											) {
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
		get modelWrites() {
			return modelWrites;
		},
		get projectionCalls() {
			return projectionCalls;
		},
		get projectionCheckpoint() {
			return projectionCheckpoint;
		},
		failNextProjection: () => {
			failProjection = true;
		},
		async load(url: string, allowProjection = true, version?: string, pending?: string) {
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
		close() {
			for (const container of containers) {
				if (!container.closed) container.close();
				container.dispose();
			}
			tracker.reset();
		},
	};
}

async function verifyGroupedProjection(
	backend: ReferenceBackend,
	url: string,
	version: string | undefined,
	expectedHtml: string,
): Promise<void> {
	const initial = await backend.inspect(url, version);
	try {
		const projectionTree = initial.snapshot.snapshotTree.trees[projectionKey];
		if (backend.supportsLoadingGroups) assert.equal(projectionTree.groupId, projectionGroup);
		const htmlId = projectionTree.blobs["document.html"];
		assert(htmlId !== undefined, "ID manifest must survive body omission");
		if (backend.expectGroupOmission) {
			assert(!initial.snapshot.blobContents.has(htmlId));
		}
		assert.equal(Buffer.from(await initial.readBlob(htmlId)).toString(), expectedHtml);
		if (!backend.supportsLoadingGroups) return;
		const grouped = await backend.inspect(url, version, [projectionGroup]);
		try {
			const id = grouped.snapshot.snapshotTree.trees[projectionKey].blobs["document.html"];
			const bytes = grouped.snapshot.blobContents.get(id);
			assert(bytes !== undefined, "Explicit group retrieval must return projection contents");
			assert.equal(Buffer.from(bytes).toString(), expectedHtml);
			assert.equal(grouped.snapshot.sequenceNumber, initial.snapshot.sequenceNumber);
		} finally {
			grouped.dispose();
		}
	} finally {
		initial.dispose();
	}
}

/**
 * Entire behavior is real: external storage creation, loader, native runtimes,
 * SharedTree ops/rebase, summary upload, service ACK, and fresh native loading.
 */
export async function runReferenceWorkflow(backend: ReferenceBackend): Promise<void> {
	const session = referenceSession(backend);
	try {
		const url = await backend.create(externalSeed(exampleHtml));
		const seedInspection = await backend.inspect(url);
		const seedVersion = seedInspection.snapshot.snapshotTree.id;
		seedInspection.dispose();
		await verifyGroupedProjection(backend, url, seedVersion, exampleHtml);
		const a = await session.load(url);
		const b = await session.load(url);
		await session.tracker.ensureSynchronized();
		const appA = (await a.getEntryPoint()) as HtmlEntryPoint;
		const appB = (await b.getEntryPoint()) as HtmlEntryPoint;
		assert.equal(viewHtml(appA.view), exampleHtml);
		assert.equal(viewHtml(appB.view), exampleHtml);
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
		text(appA, 0).text = "Hello from A";
		text(appB, 1).text = "World from B";
		paragraph(appA, 0).children.insertAtEnd(new HtmlText({ text: " +A" }));
		paragraph(appB, 0).children.insertAtEnd(new HtmlText({ text: " +B" }));
		queueA.resume();
		queueB.resume();
		await session.tracker.ensureSynchronized();
		const merged = viewHtml(appA.view);
		assert.equal(viewHtml(appB.view), merged);
		assert(merged.includes("Hello from A") && merged.includes("World from B"));
		assert(merged.includes("+A") && merged.includes("+B"));

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
		assert.equal(
			viewHtml(summarizerObservation.app.view),
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
		assert.equal(summaryHtml(accepted.summaryTree), merged);
		assert.equal(
			accepted.summaryRefSeq,
			session.projectionCheckpoint,
			"Projection must be produced at the summarizer's own checkpoint",
		);
		await verifyGroupedProjection(backend, url, accepted.summaryVersion, merged);
		accepted = await summarizeNow(summarizer, "seed-loaded runtime stays full after ACK");
		assertFull(accepted.summaryTree);
		assert.equal(summaryHtml(accepted.summaryTree), merged);

		// No materialization fallback: this must be an entirely normal native load.
		const fresh = await session.load(url, false, accepted.summaryVersion);
		const freshApp = (await fresh.getEntryPoint()) as HtmlEntryPoint;
		await session.tracker.ensureSynchronized();
		assert.equal(viewHtml(freshApp.view), merged);
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
		text(freshApp, 1).text = "Native follow-up";
		await session.tracker.ensureSynchronized(a, b, fresh);
		const native = await createSummarizerCore(
			fresh,
			session.makeLoader(false),
			accepted.summaryVersion,
		);
		session.track(native.container);
		await session.tracker.ensureSynchronized(a, b, fresh, native.container);
		const refreshed = await summarizeNow(native.summarizer, "refresh readable projection");
		assert.equal(summaryHtml(refreshed.summaryTree), viewHtml(freshApp.view));
		await verifyGroupedProjection(
			backend,
			url,
			refreshed.summaryVersion,
			viewHtml(freshApp.view),
		);
		// No content changes: native descendants can be handles; app output still exists.
		const callsBeforeRepeat = session.projectionCalls;
		const repeated = await summarizeNow(native.summarizer, "repeat without native changes");
		assert.equal(session.projectionCalls, callsBeforeRepeat + 1);
		assert.equal(summaryHtml(repeated.summaryTree), viewHtml(freshApp.view));
		const channels = repeated.summaryTree.tree[".channels"];
		assert(
			channels.type === SummaryType.Tree && hasHandle(channels),
			"Fresh native runtimes should retain normal native handle reuse",
		);
	} finally {
		session.close();
	}
}

export async function runPendingRestoreWorkflow(
	backend: ReferenceBackend,
	useSnapshotApi = true,
): Promise<void> {
	const session = referenceSession(backend, useSnapshotApi);
	try {
		const url = await backend.create(externalSeed(exampleHtml));
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
		text(app, 0).text = "Pending edit";
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
