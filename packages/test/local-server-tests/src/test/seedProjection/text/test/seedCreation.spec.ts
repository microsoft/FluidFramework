/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "node:assert";
import { randomUUID } from "node:crypto";
import { setImmediate } from "node:timers/promises";

import {
	LoaderHeader,
	type IContainer,
	type IRuntimeFactory,
} from "@fluidframework/container-definitions/internal";
import { Loader } from "@fluidframework/container-loader/internal";
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
} from "@fluidframework/test-utils/internal";

import { createSeedDocument } from "../externalSeedFile.js";
import { layout } from "../runtimeMaterialization.js";
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
			pending?: boolean;
			config?: Record<string, boolean>;
		} = {},
	): Loader {
		const application = sampleRuntimeFactory({
			nativeOnly: options.nativeOnly,
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
		return new Loader({
			documentServiceFactory: factory,
			urlResolver: resolver,
			codeLoader: new LocalCodeLoader([[codeDetails, observed]]),
			configProvider: createTestConfigProvider({
				"Fluid.Container.UseLoadingGroupIdForSnapshotFetch2": true,
				"Fluid.Container.enableOfflineFull": false,
				...options.config,
			}),
		});
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

	it("creates without DDSs, independently collaborates, persists full then incremental, and reloads native-only", async () => {
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
		assert.equal(
			uploads.length,
			0,
			"Automatic summaries are disabled in the reference factory",
		);
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
		const accepted = await summaryLoad.summaries.summarize(
			summarizer,
			"persist native seed state",
		);
		assertFull(accepted.summaryTree);
		assert.equal(
			accepted.summaryTree.tree[seedRoot],
			undefined,
			"Do not retain stale application input",
		);
		assert.equal(uploads[0].context.ackHandle, seedVersion);
		assert(accepted.summaryTree.tree.gc !== undefined);

		// Calls queue in the actual host, without a test-supplied fullTree flag.
		const [incremental] = await Promise.all([
			summaryLoad.summaries.summarize(summarizer, "reuse accepted native state"),
			summaryLoad.summaries.summarize(summarizer, "serialized subsequent request"),
		]);
		const channels: SummaryObject | undefined = incremental.summaryTree.tree[".channels"];
		assert(channels?.type === SummaryType.Tree);
		const store: SummaryObject | undefined = channels.tree[layout.storeId];
		assert(store?.type === SummaryType.Handle);
		assert.equal(store.handle, `/.channels/${layout.storeId}`);
		const gc: SummaryObject | undefined = incremental.summaryTree.tree.gc;
		assert.equal(gc?.type, SummaryType.Handle);
		assert.equal(uploads[1].context.ackHandle, accepted.summaryVersion);
		const storedNative = await inspect(url, incremental.summaryVersion);
		assert.equal(storedNative.snapshotTree.trees[seedRoot], undefined);
		assert(storedNative.snapshotTree.blobs[".metadata"] !== undefined);

		const writesBeforeReload = writes;
		track(
			await makeLoader({ nativeOnly: true }).resolve({
				url,
				headers: { [LoaderHeader.version]: incremental.summaryVersion },
			}),
		);
		await tracker.ensureSynchronized();
		const native = loads.at(-1);
		assert(native !== undefined && !native.fromSeed);
		assert.equal(native.context.baseSnapshot, native.original.baseSnapshot);
		assert.deepEqual(readParts(native.app.view), expected);
		assert.equal(
			writes,
			writesBeforeReload,
			"Native reload must not initialize another graph",
		);
	});

	it("closes a failed summarizer and requires a fresh seed load before retry", async () => {
		const url = await create();
		const client = track(await makeLoader().resolve({ url }));
		const failed = await createSummarizerCore(client, makeLoader());
		track(failed.container);
		await tracker.ensureSynchronized();
		const failedLoad = loads.at(-1);
		assert(failedLoad !== undefined);
		failUpload = true;
		await assert.rejects(
			failedLoad.summaries.summarize(failed.summarizer, "injected failure"),
		);
		assert(failed.container.closed);
		assert.equal(uploads.length, 0);
		await assert.rejects(
			failedLoad.summaries.summarize(failed.summarizer, "forbidden reuse"),
			/fresh summarizer/,
		);
		// Closing the only write client starts a server-authored summary. Load after it commits.
		const deadline = Date.now() + 10_000;
		let recoveryVersion: string | undefined;
		do {
			assert(Date.now() < deadline, "Local server did not finish closing the failed client");
			await setImmediate();
			const storedRecovery = await inspect(url);
			recoveryVersion = storedRecovery.snapshotTree.id;
			assert(recoveryVersion !== undefined, "Stored recovery snapshot must have a version");
		} while (recoveryVersion === failedLoad.original.getLoadedFromVersion()?.id);
		const replacement = await createSummarizerCore(client, makeLoader(), recoveryVersion);
		track(replacement.container);
		await tracker.ensureSynchronized();
		const replacementLoad = loads.at(-1);
		assert(replacementLoad !== undefined);
		assert.equal(
			replacementLoad.original.getLoadedFromVersion()?.id,
			recoveryVersion,
			"Recovery loads the newer server-authored seed snapshot",
		);
		const accepted = await replacementLoad.summaries.summarize(
			replacement.summarizer,
			"fresh retry",
		);
		assertFull(accepted.summaryTree);
		assert.equal(uploads.length, 1);
	});

	it("rejects a direct summary request outside the host before storage writes", async () => {
		const url = await create();
		const client = track(await makeLoader().resolve({ url }));
		const attempt = await createSummarizerCore(client, makeLoader());
		track(attempt.container);
		await assert.rejects(summarizeNow(attempt.summarizer), /SeedSummaryHost/);
		assert.equal(uploads.length, 0);
	});

	it("rejects native-only seed loading and detached creation", async () => {
		const url = await create();
		await assert.rejects(makeLoader({ nativeOnly: true }).resolve({ url }), /Native-only/);
		await assert.rejects(
			makeLoader().createDetachedContainer(codeDetails),
			/existing, externally/,
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
