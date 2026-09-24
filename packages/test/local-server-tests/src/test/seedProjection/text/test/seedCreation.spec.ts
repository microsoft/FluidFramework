/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "node:assert";
import { randomUUID } from "node:crypto";

import {
	LoaderHeader,
	type IContainer,
	type IRuntimeFactory,
} from "@fluidframework/container-definitions/internal";
import { Loader } from "@fluidframework/container-loader/internal";
import {
	DefaultSummaryConfiguration,
	SummaryCollection,
} from "@fluidframework/container-runtime/internal";
import { SummaryType, type SummaryObject } from "@fluidframework/driver-definitions";
import type {
	IDocumentServiceFactory,
	ISnapshot,
	ISummaryContext,
	ISummaryTree,
} from "@fluidframework/driver-definitions/internal";
import {
	LocalDocumentServiceFactory,
	LocalResolver,
} from "@fluidframework/local-driver/internal";
import {
	LocalDeltaConnectionServer,
	type ILocalDeltaConnectionServer,
} from "@fluidframework/server-local-server";
import { wrapObjectAndOverride } from "@fluidframework/test-runtime-utils/internal";
import {
	createSummarizerCore,
	createTestConfigProvider,
	LoaderContainerTracker,
	LocalCodeLoader,
	summarizeNow,
	timeoutAwait,
} from "@fluidframework/test-utils/internal";

import { createSeedDocument } from "../externalSeedFile.js";
import { sampleRuntimeFactory, type SeedLoad } from "../sampleRuntimeFactory.js";
import { codeDetails, seedRoot } from "../textSeedFormat.js";
import { readParts, TextNode } from "../textTreeSchema.js";

describe("Seed creation: real local-service lifecycle", function () {
	this.timeout(30_000);
	const seed = {
		format: "seed-creation/1",
		parts: [
			{ name: "first", text: "Hello" },
			{ name: "second", text: "World" },
		],
	};
	let server: ILocalDeltaConnectionServer;
	let rawFactory: LocalDocumentServiceFactory;
	let factory: IDocumentServiceFactory;
	let resolver: LocalResolver;
	let tracker: LoaderContainerTracker;
	let writes: number;
	let failUpload: boolean;
	const containers: IContainer[] = [];
	const loads: SeedLoad[] = [];
	const uploads: { summary: ISummaryTree; context: ISummaryContext }[] = [];

	beforeEach(() => {
		server = LocalDeltaConnectionServer.create();
		rawFactory = new LocalDocumentServiceFactory(server);
		resolver = new LocalResolver();
		tracker = new LoaderContainerTracker(true);
		writes = 0;
		failUpload = false;
		factory = wrapObjectAndOverride(
			rawFactory,
			{
				createDocumentService: {
					connectToStorage: {
						uploadSummaryWithContext: (storage) => async (summary, context) => {
							if (failUpload) {
								failUpload = false;
								throw new Error("Injected seed-summary upload failure");
							}
							uploads.push({ summary, context });
							return storage.uploadSummaryWithContext(summary, context);
						},
					},
				},
			},
			{ receiver: "target" },
		);
	});

	afterEach(async () => {
		for (const container of containers.splice(0)) {
			if (!container.closed) container.close();
			container.dispose();
		}
		tracker.reset();
		loads.length = 0;
		uploads.length = 0;
		await server.close();
	});

	/** Use a new loader and factory for each client, with only server storage shared. */
	function makeLoader(
		options: {
			nativeOnly?: boolean;
			automatic?: boolean;
			pending?: boolean;
			config?: Record<string, boolean>;
		} = {},
	): Loader {
		assert(DefaultSummaryConfiguration.state === "enabled");
		const application = sampleRuntimeFactory({
			nativeOnly: options.nativeOnly,
			summaryConfigOverrides: options.automatic
				? {
						...DefaultSummaryConfiguration,
						state: "enabled",
						initialSummarizerDelayMs: 0,
						maxOps: 1,
						minIdleTime: 1,
						maxIdleTime: 1,
					}
				: {
						...DefaultSummaryConfiguration,
						state: "summaryOnRequest",
						initialSummarizerDelayMs: 0,
						maxAckWaitTime: 20_000,
					},
			observe: (load) => loads.push(load),
		});
		const observed: IRuntimeFactory = {
			get IRuntimeFactory() {
				return this;
			},
			instantiateRuntime: async (context, existing) =>
				application.instantiateRuntime(
					wrapObjectAndOverride(
						context,
						{
							submitBatchFn: (target) => (batch, sequence) => {
								writes += batch.length;
								return target.submitBatchFn(batch, sequence);
							},
							submitFn:
								(target) =>
								(...args) => {
									writes++;
									return target.submitFn(...args);
								},
							pendingLocalState: (target) =>
								options.pending ? { unsupported: true } : target.pendingLocalState,
						},
						{ receiver: "target" },
					),
					existing,
				),
		};
		const loader = new Loader({
			documentServiceFactory: factory,
			urlResolver: resolver,
			codeLoader: new LocalCodeLoader([[codeDetails, observed]]),
			configProvider: createTestConfigProvider({
				"Fluid.Container.UseLoadingGroupIdForSnapshotFetch2": true,
				"Fluid.Container.enableOfflineFull": false,
				...options.config,
			}),
		});
		tracker.add(loader);
		return loader;
	}

	/** Enroll real client queues for synchronization and always dispose their owners. */
	function track(container: IContainer): IContainer {
		containers.push(container);
		tracker.addContainer(container);
		return container;
	}

	/** Use the external producer, not createDetachedContainer or a prebuilt native summary. */
	async function create(): Promise<string> {
		return createSeedDocument(
			seed,
			rawFactory,
			resolver,
			resolver.createCreateNewRequest(randomUUID()),
		);
	}

	/** Inspect actual service storage, outside all runtime overlays. */
	async function inspect(url: string, version?: string): Promise<ISnapshot> {
		const resolved = await resolver.resolve({ url });
		const service = await rawFactory.createDocumentService(resolved);
		try {
			const storage = await service.connectToStorage();
			assert(storage.getSnapshot !== undefined);
			return await storage.getSnapshot({ versionId: version });
		} finally {
			service.dispose();
		}
	}

	/** Check every descendant, including native GC and SharedTree summary nodes. */
	function assertFull(summary: ISummaryTree): void {
		for (const entry of Object.values(summary.tree)) {
			assert.notEqual(entry.type, SummaryType.Handle);
			if (entry.type === SummaryType.Tree) assertFull(entry);
		}
	}

	it("graduates automatically without application writes and continues automatic persistence", async () => {
		const url = await create();
		const client = track(await makeLoader({ automatic: true }).resolve({ url }));
		const summaries = new SummaryCollection(client.deltaManager, { send: () => {} });
		const first = await timeoutAwait(summaries.waitSummaryAck(0), {
			errorMsg: "Automatic first summary was not acknowledged",
		});
		assert.equal(writes, 0, "Graduation must not require an initialization or dummy model op");
		assertFull(uploads[0].summary);
		assert.equal(uploads[0].summary.tree[seedRoot], undefined);
		const firstStored = await inspect(url, first.summaryAck.contents.handle);
		assert(firstStored.snapshotTree.blobs[".metadata"] !== undefined);
		assert.equal(firstStored.snapshotTree.trees[seedRoot], undefined);

		const interactive = loads.find(
			(load) => load.context.clientDetails.capabilities.interactive,
		);
		assert(interactive !== undefined);
		const part = interactive.app.view.root.parts.get("first");
		assert(part !== undefined);
		const requiredSummaryReference = client.deltaManager.lastSequenceNumber + 1;
		part.text = "Edited after automatic graduation";
		await tracker.ensureSynchronized();
		const later = await timeoutAwait(summaries.waitSummaryAck(requiredSummaryReference), {
			errorMsg: "Automatic summary after editing was not acknowledged",
		});
		assert.notEqual(later.summaryAck.contents.handle, first.summaryAck.contents.handle);

		track(
			await makeLoader({ nativeOnly: true }).resolve({
				url,
				headers: { [LoaderHeader.version]: later.summaryAck.contents.handle },
			}),
		);
		const reloaded = loads.at(-1);
		assert(reloaded !== undefined && !reloaded.fromSeed);
		assert.equal(reloaded.app.view.root.parts.get("first")?.text, part.text);
	});

	it("independently collaborates, replays edits, persists full then incremental, and reloads without the adapter", async () => {
		const url = await create();
		assert.equal(loads.length, 0, "The producer must not instantiate an application runtime");
		const storedSeed = await inspect(url);
		assert.equal(storedSeed.snapshotTree.blobs[".metadata"], undefined);
		assert(storedSeed.snapshotTree.trees[seedRoot] !== undefined);
		const seedVersion = storedSeed.snapshotTree.id;
		assert(seedVersion !== undefined);

		const a = track(await makeLoader().resolve({ url }));
		track(await makeLoader().resolve({ url }));
		await tracker.ensureSynchronized();
		const [loadA, loadB] = loads;
		assert(loadA.fromSeed && loadB.fromSeed);
		assert.deepEqual(readParts(loadA.app.view), seed.parts);
		assert.deepEqual(readParts(loadB.app.view), seed.parts);
		assert.notEqual(loadA.app.sessionId, loadB.app.sessionId);
		assert(loadA.app.sessionId !== undefined && loadB.app.sessionId !== undefined);
		assert.equal(
			writes,
			0,
			"Opening must not initialize, assign aliases, or submit model ops",
		);
		assert.equal(uploads.length, 0, "This test explicitly selects on-demand summaries");
		assert.equal(loadA.original.baseSnapshot?.blobs[".metadata"], undefined);
		assert.notEqual(loadA.context, loadA.original);
		assert(loadA.context.baseSnapshot?.blobs[".metadata"] !== undefined);
		assert.equal(loadA.context.baseSnapshot?.id, seedVersion);
		assert.equal(loadA.context.deltaManager, loadA.original.deltaManager);

		const first = loadA.app.view.root.parts.get("first");
		const second = loadB.app.view.root.parts.get("second");
		assert(first !== undefined && second !== undefined);
		first.text = "Edited by A";
		second.text = "Edited by B";
		await tracker.ensureSynchronized();
		assert.deepEqual(readParts(loadA.app.view), readParts(loadB.app.view));
		assert.deepEqual(readParts(loadA.app.view), [
			{ name: "first", text: "Edited by A" },
			{ name: "second", text: "Edited by B" },
		]);
		// Both clients allocate new nodes in their own live compressor sessions.
		loadA.app.view.root.parts.set("first", new TextNode({ text: "Replacement A" }));
		loadB.app.view.root.parts.set("second", new TextNode({ text: "Replacement B" }));
		await tracker.ensureSynchronized();
		const expected = readParts(loadA.app.view);
		assert.deepEqual(readParts(loadB.app.view), expected);

		const { container, summarizer } = await createSummarizerCore(a, makeLoader(), seedVersion);
		track(container);
		await tracker.ensureSynchronized();
		const summaryLoad = loads.at(-1);
		assert(summaryLoad?.fromSeed);
		assert.deepEqual(
			readParts(summaryLoad.app.view),
			expected,
			"Loader must replay the sequenced suffix after construction",
		);
		const accepted = await summarizeNow(summarizer, "persist seed state as a Fluid summary");
		assertFull(accepted.summaryTree);
		assert.equal(
			accepted.summaryTree.tree[seedRoot],
			undefined,
			"Do not retain stale application input",
		);
		assert.equal(uploads[0].context.ackHandle, seedVersion);
		assert(accepted.summaryTree.tree.gc !== undefined);

		const incremental = await summarizeNow(summarizer, "reuse the adopted Fluid summary");
		const channels: SummaryObject | undefined = incremental.summaryTree.tree[".channels"];
		assert(channels?.type === SummaryType.Tree);
		const store: SummaryObject | undefined = channels.tree[summaryLoad.app.storeId];
		assert(store?.type === SummaryType.Handle);
		assert.equal(store.handle, `/.channels/${summaryLoad.app.storeId}`);
		const gc: SummaryObject | undefined = incremental.summaryTree.tree.gc;
		assert.equal(gc?.type, SummaryType.Handle);
		assert.equal(uploads[1].context.ackHandle, accepted.summaryVersion);
		const storedNative = await inspect(url, incremental.summaryVersion);
		assert.equal(storedNative.snapshotTree.trees[seedRoot], undefined);
		assert(storedNative.snapshotTree.blobs[".metadata"] !== undefined);

		loadA.app.view.root.parts.set("first", new TextNode({ text: "Changed after graduation" }));
		await tracker.ensureSynchronized();
		const changed = await summarizeNow(summarizer, "persist new edits after graduation");
		assert.equal(uploads[2].context.ackHandle, incremental.summaryVersion);
		const changedExpected = readParts(loadA.app.view);
		assert.deepEqual(readParts(loadB.app.view), changedExpected);
		assert.deepEqual(readParts(summaryLoad.app.view), changedExpected);

		const writesBeforeReload = writes;
		track(
			await makeLoader({ nativeOnly: true }).resolve({
				url,
				headers: { [LoaderHeader.version]: changed.summaryVersion },
			}),
		);
		await tracker.ensureSynchronized();
		const native = loads.at(-1);
		assert(native !== undefined && !native.fromSeed);
		assert.equal(native.context.baseSnapshot, native.original.baseSnapshot);
		assert.deepEqual(readParts(native.app.view), changedExpected);
		assert.equal(
			writes,
			writesBeforeReload,
			"Native reload must not initialize another graph",
		);
	});

	it("keeps the first summary full after a failed upload and retries on the same runtime", async () => {
		const url = await create();
		const client = track(await makeLoader().resolve({ url }));
		const failed = await createSummarizerCore(client, makeLoader());
		track(failed.container);
		await tracker.ensureSynchronized();
		failUpload = true;
		await assert.rejects(
			summarizeNow(failed.summarizer, { reason: "injected failure", retryOnFailure: false }),
			/Injected seed-summary upload failure/,
		);
		assert.equal(failed.container.closed, false);
		assert.equal(uploads.length, 0);
		const accepted = await summarizeNow(failed.summarizer, "retry the full first summary");
		assertFull(accepted.summaryTree);
		assert.equal(uploads.length, 1);
	});

	it("rejects seed loading through the ordinary runtime and creation without initial content", async () => {
		const url = await create();
		await assert.rejects(
			makeLoader({ nativeOnly: true }).resolve({ url }),
			/Missing persisted root entry point/,
		);
		await assert.rejects(
			makeLoader().createDetachedContainer(codeDetails),
			/creation requires initial content/,
		);
	});

	for (const [name, options, message] of [
		["pending restoration", { pending: true }, /Pending\/offline/],
		[
			"offline loading",
			{ config: { "Fluid.Container.enableOfflineFull": true } },
			/Offline loading/,
		],
		[
			"deferred ACK refresh",
			{ config: { "Fluid.Summarizer.immediatelyRefreshLatestSummaryAck": false } },
			/immediate summary ACK/,
		],
	] as const) {
		it(`rejects unsupported ${name}`, async () => {
			const url = await create();
			await assert.rejects(makeLoader(options).resolve({ url }), message);
			assert.equal(loads.length, 0);
			assert.equal(writes, 0);
		});
	}
});
