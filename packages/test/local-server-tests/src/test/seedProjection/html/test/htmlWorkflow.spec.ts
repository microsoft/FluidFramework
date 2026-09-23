/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "node:assert";

import {
	SummaryType,
	type ISummaryTree,
	type SummaryObject,
} from "@fluidframework/driver-definitions";
import type { ISnapshotTree } from "@fluidframework/driver-definitions/internal";
import {
	createSummarizerCore,
	summarizeNow,
	toIDeltaManagerFull,
	waitForContainerConnection,
} from "@fluidframework/test-utils/internal";

import {
	projectionLayout,
	readApplicationProjection,
	type IHtmlPart,
} from "../appProjection.js";
import { createSeedSummary } from "../externalSeedFile.js";
import { HtmlElement, HtmlText, toTree, viewHtml, viewHtmlParts } from "../htmlTreeSchema.js";
import { parseHtml } from "../htmlSeedFormat.js";
import type { IHtmlEntryPoint } from "../sampleRuntimeFactory.js";
import {
	createSeedWorkflowSession,
	createLocalSeedBackend,
	type IInspectableStorageAdapter,
} from "../../harness/index.js";
import { createHtmlTestApplication } from "./htmlTestApplication.js";
import { payloadOf, treePart } from "./htmlTestUtils.js";

/** Canonical two-part demonstration; application code imposes no fixed part count or names. */
const exampleParts: readonly IHtmlPart[] = [
	{ name: "first", payload: '<div class="document"><p id="first">Hello</p></div>' },
	{ name: "second", payload: '<div class="details"><p id="second">World</p></div>' },
];

/** Select a known fixture paragraph, failing if loading or prior edits changed its expected structure. */
function paragraph(app: IHtmlEntryPoint, part: string): HtmlElement {
	const root = treePart(app.view, part)[0];
	assert(root instanceof HtmlElement);
	const result = root.children[0];
	assert(result instanceof HtmlElement);
	return result;
}

/** Select a fixture text node so concurrent and pending-edit tests mutate the actual collaborative DDS. */
function text(app: IHtmlEntryPoint, part: string): HtmlText {
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
	const subtree: SummaryObject | undefined = summary.tree[projectionLayout.key];
	assert(subtree?.type === SummaryType.Tree);
	assert.equal(subtree.groupId, projectionLayout.group);
	const parts: SummaryObject | undefined = subtree.tree[projectionLayout.parts];
	assert(parts?.type === SummaryType.Tree);
	return parts;
}

/** Prove an unchanged part is a previous-summary subtree handle, not a freshly serialized equivalent blob. */
function assertReusedPart(summary: ISummaryTree, part: string): void {
	assert.deepEqual(projectionSummary(summary).tree[part], {
		type: SummaryType.Handle,
		handleType: SummaryType.Tree,
		handle: `/${projectionLayout.key}/${projectionLayout.parts}/${part}`,
	});
}

/** Read one newly encoded part from the submission; reused handles deliberately cannot pass this assertion. */
function encodedPart(summary: ISummaryTree, part: string): string {
	const subtree: SummaryObject | undefined = projectionSummary(summary).tree[part];
	assert(subtree?.type === SummaryType.Tree);
	const blob: SummaryObject | undefined = subtree.tree["document.html"];
	assert(blob?.type === SummaryType.Blob && typeof blob.content === "string");
	return blob.content;
}

/** Collect persisted part blob IDs for cross-summary reuse checks without downloading either HTML body. */
function partBlobIds(snapshot: ISnapshotTree): Record<string, string> {
	const parts = snapshot.trees[projectionLayout.key]?.trees[projectionLayout.parts];
	assert(parts !== undefined);
	return Object.fromEntries(
		Object.entries(parts.trees).map(([name, part]) => {
			const id: string | undefined = part.blobs[projectionLayout.payload];
			assert(id !== undefined, "Each part ID must survive snapshot loading");
			return [name, id];
		}),
	);
}

/**
 * Inspect a persisted seed or native summary independently of client overlays.
 * Validate app-only reading, retained blob IDs, optional initial body omission, and explicit group
 * retrieval at the same checkpoint. Only assert stronger storage behavior when the backend advertises it.
 */
async function verifyGroupedProjection(
	backend: IInspectableStorageAdapter,
	url: string,
	version: string | undefined,
	expectedParts: readonly IHtmlPart[],
): Promise<Record<string, string>> {
	const initial = await backend.inspect(url, version);
	try {
		const projectionTree: ISnapshotTree | undefined =
			initial.snapshot.snapshotTree.trees[projectionLayout.key];
		assert(projectionTree !== undefined, "Persisted application projection must exist");
		if (backend.supportsLoadingGroups)
			assert.equal(projectionTree.groupId, projectionLayout.group);
		const ids = partBlobIds(initial.snapshot.snapshotTree);
		if (backend.omitsUnrequestedGroupBlobs) {
			for (const { name } of expectedParts)
				assert(!initial.snapshot.blobContents.has(ids[name]));
		}
		const projection = await readApplicationProjection(
			initial.snapshot.snapshotTree,
			initial.readBlob,
		);
		assert.deepEqual(projection.parts, expectedParts);
		if (!backend.supportsLoadingGroups) return ids;
		const grouped = await backend.inspect(url, version, [projectionLayout.group]);
		try {
			const groupedIds = partBlobIds(grouped.snapshot.snapshotTree);
			for (const { name, payload } of expectedParts) {
				const bytes = grouped.snapshot.blobContents.get(groupedIds[name]);
				assert(
					bytes !== undefined,
					"Explicit group retrieval must return each part's contents",
				);
				assert.equal(Buffer.from(bytes).toString(), payload);
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
describe("Seed projection reference: Memorylicious lifecycle", function () {
	// A ceiling for real connection/op/ACK work, not an artificial delay.
	// Do not fake the service timers: these tests exercise real sequencing and summary acceptance.
	this.timeout(30_000);
	let backend: IInspectableStorageAdapter;
	beforeEach(() => {
		backend = createLocalSeedBackend();
	});
	afterEach(async () => {
		await backend.close();
	});

	it("graduates after one full summary and reuses unchanged native and HTML subtrees", async () => {
		const application = createHtmlTestApplication();
		const session = createSeedWorkflowSession(backend, application);
		try {
			const url = await backend.create(createSeedSummary(exampleParts));
			const seedInspection = await backend.inspect(url);
			const seedVersion = seedInspection.snapshot.snapshotTree.id;
			seedInspection.dispose();
			await verifyGroupedProjection(backend, url, seedVersion, exampleParts);
			const a = await session.load(url);
			const b = await session.load(url);
			await session.tracker.ensureSynchronized();
			const appA = (await a.getEntryPoint()) as IHtmlEntryPoint;
			const appB = (await b.getEntryPoint()) as IHtmlEntryPoint;
			assert.deepEqual(viewHtmlParts(appA.view), exampleParts);
			assert.deepEqual(viewHtmlParts(appB.view), exampleParts);
			assert.notEqual(treePart(appA.view, "first"), treePart(appA.view, "second"));
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
			assert(
				payloadOf(merged, "first").includes("Hello from A") &&
					payloadOf(merged, "second").includes("World from B"),
			);
			assert(
				payloadOf(merged, "first").includes("+A") && payloadOf(merged, "first").includes("+B"),
			);

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
			assert.equal(
				summarizerObservation.provenance?.fingerprint,
				obsA.provenance?.fingerprint,
			);
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
			for (const { name, payload } of merged)
				assert.equal(encodedPart(accepted.summaryTree, name), payload);
			assert.equal(session.summaryContexts.at(-1)?.fullTree, true);
			assert.deepEqual(application.serializedParts, { first: 1, second: 1 });
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
			for (const { name } of merged) assertReusedPart(accepted.summaryTree, name);
			assert.deepEqual(application.serializedParts, { first: 1, second: 1 });
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
			assert.equal(payloadOf(editedParts, "second"), payloadOf(merged, "second"));
			const previousVersion = accepted.summaryVersion;
			accepted = await summarizeNow(summarizer, "encode only the changed HTML part");
			await session.waitForSummaryAcceptance(accepted.summaryVersion);
			assert.equal(session.summaryContexts.at(-1)?.fullTree, false);
			assert.equal(
				session.summaryContexts.at(-1)?.previousSummary?.ackHandle,
				previousVersion,
			);
			assert.equal(
				encodedPart(accepted.summaryTree, "first"),
				payloadOf(editedParts, "first"),
			);
			assertReusedPart(accepted.summaryTree, "second");
			assert.deepEqual(application.serializedParts, { first: 2, second: 1 });
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
			for (const { name } of editedParts) assertReusedPart(accepted.summaryTree, name);
			assert.deepEqual(application.serializedParts, { first: 2, second: 1 });
			assert.deepEqual(
				await verifyGroupedProjection(backend, url, accepted.summaryVersion, editedParts),
				editedIds,
			);

			// No materialization fallback: this must be an entirely normal native load.
			const fresh = await session.load(url, false, accepted.summaryVersion);
			const freshApp = (await fresh.getEntryPoint()) as IHtmlEntryPoint;
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
			for (const { name, payload } of nativeParts)
				assert.equal(encodedPart(refreshed.summaryTree, name), payload);
			assert.equal(session.summaryContexts.at(-1)?.fullTree, false);
			await verifyGroupedProjection(backend, url, refreshed.summaryVersion, nativeParts);
			// No content changes: native descendants can be handles; app output still exists.
			const callsBeforeRepeat = session.projectionCalls;
			const serializedBeforeRepeat = { ...application.serializedParts };
			const repeated = await summarizeNow(native.summarizer, "repeat without native changes");
			await session.waitForSummaryAcceptance(repeated.summaryVersion);
			assert.equal(session.projectionCalls, callsBeforeRepeat + 1);
			assert.deepEqual(application.serializedParts, serializedBeforeRepeat);
			for (const { name } of nativeParts) assertReusedPart(repeated.summaryTree, name);
			await verifyGroupedProjection(backend, url, repeated.summaryVersion, nativeParts);
			const channels: SummaryObject | undefined = repeated.summaryTree.tree[".channels"];
			assert(
				channels?.type === SummaryType.Tree && hasHandle(channels),
				"Fresh native runtimes should retain normal native handle reuse",
			);
		} finally {
			session.close();
		}
	});

	for (const manifest of [undefined, '{ "title": "custom metadata", "extra": [1, 2] }']) {
		it(`persists variable-part structural edits and restores pending work with ${manifest === undefined ? "no" : "custom"} manifest`, async () => {
			const application = createHtmlTestApplication();
			const session = createSeedWorkflowSession(backend, application);
			const source = ["alpha", "bravo", "charlie", "delta"].map((name) => ({
				name,
				payload: `<div><p>${name}</p></div>`,
			}));
			try {
				// External input order is deliberately reversed; identities depend on names, not enumeration order.
				const url = await backend.create(
					createSeedSummary([...source].reverse(), {
						includeManifest: manifest !== undefined,
						manifest,
					}),
				);
				const a = await session.load(url);
				const b = await session.load(url);
				await session.tracker.ensureSynchronized();
				const appA = (await a.getEntryPoint()) as IHtmlEntryPoint;
				const appB = (await b.getEntryPoint()) as IHtmlEntryPoint;
				assert.deepEqual(viewHtmlParts(appA.view), source);
				assert.deepEqual(viewHtmlParts(appB.view), source);
				assert.equal(
					session.observations[0].provenance?.fingerprint,
					session.observations[1].provenance?.fingerprint,
				);
				assert.equal(session.modelWrites, 0);
				assert.equal(backend.uploads.length, 0);

				const queueA = toIDeltaManagerFull(a.deltaManager).outbound;
				const queueB = toIDeltaManagerFull(b.deltaManager).outbound;
				await Promise.all([queueA.pause(), queueB.pause()]);
				text(appA, "alpha").text = "from A";
				text(appB, "bravo").text = "from B";
				queueA.resume();
				queueB.resume();
				await session.tracker.ensureSynchronized();
				assert.deepEqual(viewHtmlParts(appA.view), viewHtmlParts(appB.view));
				const { container, summarizer } = await createSummarizerCore(a, session.makeLoader());
				session.track(container);
				await session.tracker.ensureSynchronized();
				let accepted = await summarizeNow(summarizer);
				await session.waitForSummaryAcceptance(accepted.summaryVersion);
				assertFull(accepted.summaryTree);
				const initialIds = await verifyGroupedProjection(
					backend,
					url,
					accepted.summaryVersion,
					viewHtmlParts(appA.view),
				);

				// Rename is a remove/add in this name-indexed model. Replacement under the same name is a new identity.
				const charlie = payloadOf(viewHtmlParts(appA.view), "charlie");
				appA.view.root.parts.delete("charlie");
				appA.view.root.parts.set("renamed", toTree(parseHtml(charlie)));
				appA.view.root.parts.delete("bravo");
				appA.view.root.parts.set("epsilon", toTree(parseHtml("<div><p>new part</p></div>")));
				appA.view.root.parts.set(
					"alpha",
					toTree(parseHtml("<div><p>replacement alpha</p></div>")),
				);
				await session.tracker.ensureSynchronized();
				assert.deepEqual(viewHtmlParts(appA.view), viewHtmlParts(appB.view));
				accepted = await summarizeNow(summarizer);
				await session.waitForSummaryAcceptance(accepted.summaryVersion);
				assert.equal(session.summaryContexts.at(-1)?.fullTree, false);
				const submitted = backend.uploads.at(-1);
				assert(submitted !== undefined);
				assertReusedPart(submitted.summary, "delta");
				assert.equal(
					application.serializedParts.delta,
					1,
					"An untouched part must bypass the serializer",
				);
				assert.deepEqual(Object.keys(projectionSummary(submitted.summary).tree), [
					"alpha",
					"delta",
					"epsilon",
					"renamed",
				]);
				const structuralIds = await verifyGroupedProjection(
					backend,
					url,
					accepted.summaryVersion,
					viewHtmlParts(appA.view),
				);
				assert.equal(
					structuralIds.delta,
					initialIds.delta,
					"No reupload: the actual persisted blob ID must remain unchanged",
				);
				assert.notEqual(structuralIds.alpha, initialIds.alpha);

				// An ACKed native snapshot is authoritative. Disallow materialization on both reload and restore.
				const native = await session.load(url, false, accepted.summaryVersion);
				await session.tracker.ensureSynchronized();
				const nativeApp = (await native.getEntryPoint()) as IHtmlEntryPoint;
				assert.equal(session.observations.at(-1)?.projected, false);
				assert.deepEqual(viewHtmlParts(nativeApp.view), viewHtmlParts(appA.view));
				native.disconnect();
				nativeApp.view.root.parts.delete("epsilon");
				nativeApp.view.root.parts.set(
					"offline",
					toTree(parseHtml("<div><p>pending addition</p></div>")),
				);
				text(nativeApp, "renamed").text = "pending edit";
				assert(native.getPendingLocalState !== undefined);
				const pending = await native.getPendingLocalState();
				assert(pending !== undefined && !pending.includes("projected:"));
				native.close();
				native.dispose();
				const restored = await session.load(url, false, undefined, pending);
				await waitForContainerConnection(restored);
				await session.tracker.ensureSynchronized(a, b, container, restored);
				assert.equal(session.observations.at(-1)?.projected, false);
				const restoredApp = (await restored.getEntryPoint()) as IHtmlEntryPoint;
				assert.deepEqual(viewHtmlParts(restoredApp.view), viewHtmlParts(appA.view));
				assert.equal(appA.view.root.parts.has("epsilon"), false);
				assert(payloadOf(viewHtmlParts(appA.view), "offline").includes("pending addition"));
				accepted = await summarizeNow(summarizer);
				await session.waitForSummaryAcceptance(accepted.summaryVersion);
				assertReusedPart(accepted.summaryTree, "delta");
				assert.equal(application.serializedParts.delta, 1);
				const finalIds = await verifyGroupedProjection(
					backend,
					url,
					accepted.summaryVersion,
					viewHtmlParts(appA.view),
				);
				assert.equal(finalIds.delta, initialIds.delta);
				const inspection = await backend.inspect(url, accepted.summaryVersion);
				try {
					const exported = await readApplicationProjection(
						inspection.snapshot.snapshotTree,
						inspection.readBlob,
					);
					assert.equal(exported.manifest, manifest);
				} finally {
					inspection.dispose();
				}
			} finally {
				session.close();
			}
		});
	}

	for (const count of [0, 1]) {
		it(`loads and graduates a ${count}-part document without initialization writes`, async () => {
			const session = createSeedWorkflowSession(backend, createHtmlTestApplication());
			const source = count === 0 ? [] : [{ name: "only", payload: "" }];
			try {
				const url = await backend.create(
					createSeedSummary(source, { includeManifest: false }),
				);
				const client = await session.load(url);
				await session.tracker.ensureSynchronized();
				assert.equal(session.modelWrites, 0);
				assert.equal(backend.uploads.length, 0);
				const { container, summarizer } = await createSummarizerCore(
					client,
					session.makeLoader(),
				);
				session.track(container);
				await session.tracker.ensureSynchronized();
				const accepted = await summarizeNow(summarizer);
				await session.waitForSummaryAcceptance(accepted.summaryVersion);
				const native = await session.load(url, false, accepted.summaryVersion);
				assert.deepEqual(
					viewHtmlParts(((await native.getEntryPoint()) as IHtmlEntryPoint).view),
					source,
				);
				await verifyGroupedProjection(backend, url, accepted.summaryVersion, source);
			} finally {
				session.close();
			}
		});
	}

	it("reconstructs the projected context from pending state without the old overlay", async () => {
		await runPendingRestoreWorkflow(backend);
	});
	it("restores a tree-only original load as ISnapshot without mixing source and projected blobs", async () => {
		await runPendingRestoreWorkflow(backend, false);
	});
});

/**
 * Load two seed clients, disconnect one, save its pending edit, and reconstruct it in a fresh loader.
 * Deny retained seed-body storage reads during restoration to prove source dependencies, not virtual
 * blobs or a live version object, suffice. Validate the same fingerprint, normal replay, and convergence.
 * Cover both initial snapshot APIs; the loader's restored representation is ISnapshot in either case.
 */
async function runPendingRestoreWorkflow(
	backend: IInspectableStorageAdapter,
	useSnapshotApi = true,
): Promise<void> {
	const session = createSeedWorkflowSession(
		backend,
		createHtmlTestApplication(),
		useSnapshotApi,
	);
	try {
		const url = await backend.create(createSeedSummary(exampleParts));
		const a = await session.load(url);
		const b = await session.load(url);
		await session.tracker.ensureSynchronized();
		const app = (await a.getEntryPoint()) as IHtmlEntryPoint;
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
		const restoredApp = (await restored.getEntryPoint()) as IHtmlEntryPoint;
		assert.equal(
			viewHtml(restoredApp.view),
			viewHtml(((await b.getEntryPoint()) as IHtmlEntryPoint).view),
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
