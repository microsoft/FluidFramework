/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "assert";

import { describeCompat } from "@fluid-private/test-version-utils";
import { LoaderHeader } from "@fluidframework/container-definitions/internal";
import type { IFluidHandle } from "@fluidframework/core-interfaces";
import { delay } from "@fluidframework/core-utils/internal";
import { SummaryType } from "@fluidframework/driver-definitions";
import type { ISharedMap } from "@fluidframework/map/internal";
import type {
	FluidDataStoreContextInternal,
	IFluidDataStoreChannelCollection,
	IFluidDataStoreFactory,
	IFluidDataStoreFactoryInternal,
	IFluidDataStoreRegistry,
} from "@fluidframework/runtime-definitions/internal";
import { toFluidHandleInternal } from "@fluidframework/runtime-utils/internal";
import {
	createSummarizerCore,
	createTestConfigProvider,
	getRequiredPendingLocalState,
	summarizeNow,
	timeoutPromise,
	waitForContainerConnection,
	type ITestFluidObject,
	type ITestObjectProvider,
} from "@fluidframework/test-utils/internal";

import {
	getGCDeletedStateFromSummary,
	getGCStateFromSummary,
	getGCTombstoneStateFromSummary,
	// eslint-disable-next-line import-x/no-internal-modules -- Reuse the GC suite's summary readers.
} from "./gc/gcTestSummaryUtils.js";

describeCompat("Native channel collections", "NoCompat", (getTestObjectProvider, apis) => {
	const { SharedMap } = apis.dds;
	const { LeafChannelRuntime } = apis.dataRuntime.packages.datastore;
	const { ContainerRuntimeFactoryWithDefaultDataStore } = apis.containerRuntime;
	const { TestFluidObjectFactory } = apis.dataRuntime;
	const legacyFactory = new TestFluidObjectFactory([], "legacy-child");
	const channelFactory = SharedMap.getFactory();
	const leafFactory: IFluidDataStoreFactoryInternal = {
		type: channelFactory.type,
		isLeafChannel: true,
		get IFluidDataStoreFactory() {
			return this;
		},
		async instantiateDataStore(context, existing) {
			return LeafChannelRuntime.load(context, existing, channelFactory);
		},
	};
	const registry: IFluidDataStoreRegistry = {
		get IFluidDataStoreRegistry() {
			return this;
		},
		async get(type) {
			return type === leafFactory.type
				? leafFactory
				: type === factory.type
					? factory
					: type === legacyFactory.type
						? legacyFactory
						: undefined;
		},
	};
	const factory: IFluidDataStoreFactory & {
		IFluidDataStoreRegistry: IFluidDataStoreRegistry;
	} = {
		type: "native-collection",
		IFluidDataStoreRegistry: registry,
		get IFluidDataStoreFactory() {
			return this;
		},
		async instantiateDataStore(context, existing) {
			const nativeContext = context as FluidDataStoreContextInternal;
			assert(nativeContext.createChannelCollection !== undefined);
			return nativeContext.createChannelCollection(async (collection) => {
				if (!existing) {
					const root = await collection.createDataStore(leafFactory, "root");
					collection.bind(root.entryPoint);
				}
				return collection;
			});
		},
	};
	const runtimeFactory = new ContainerRuntimeFactoryWithDefaultDataStore({
		defaultFactory: factory,
		registryEntries: [[factory.type, factory]],
		oldestSupportedClient: "3.12.0",
		runtimeOptions: {
			summaryOptions: {
				summaryConfigOverrides: {
					state: "disableHeuristics",
					initialSummarizerDelayMs: 0,
					maxAckWaitTime: 20000,
					maxOpsSinceLastSummary: 7000,
				},
			},
		},
	});

	let provider: ITestObjectProvider;
	beforeEach(() => {
		provider = getTestObjectProvider();
	});

	async function getRoot(collection: IFluidDataStoreChannelCollection): Promise<ISharedMap> {
		return (await (await collection.getDataStoreEntryPoint("root")).get()) as ISharedMap;
	}

	it("routes handles to genuinely nested leaves and composites", async () => {
		const container = await provider.createContainer(runtimeFactory);
		const parent = (await container.getEntryPoint()) as IFluidDataStoreChannelCollection;
		const root = await getRoot(parent);
		const childStore = await parent.createDataStore(factory);
		const child = (await childStore.entryPoint.get()) as IFluidDataStoreChannelCollection;
		const childRoot = await getRoot(child);
		childRoot.set("value", 42);
		root.set("child", childStore.entryPoint);
		await provider.ensureSynchronized();

		const remote = await provider.loadContainer(runtimeFactory);
		const parent2 = (await remote.getEntryPoint()) as IFluidDataStoreChannelCollection;
		const root2 = await getRoot(parent2);
		await provider.ensureSynchronized();
		const handle = root2.get<IFluidHandle<IFluidDataStoreChannelCollection>>("child");
		assert(handle !== undefined);
		const child2 = await handle.get();
		const childRoot2 = await getRoot(child2);
		assert.equal(childRoot2.get("value"), 42);
		assert.equal(
			toFluidHandleInternal(childRoot.handle).absolutePath,
			`${toFluidHandleInternal(childStore.entryPoint).absolutePath}/root`,
		);
		childRoot2.set("value", 43);
		await provider.ensureSynchronized();
		assert.equal(childRoot.get("value"), 43);
	});

	it("attaches ancestors when only a descendant handle is referenced", async () => {
		const container = await provider.createContainer(runtimeFactory);
		const parent = (await container.getEntryPoint()) as IFluidDataStoreChannelCollection;
		const root = await getRoot(parent);
		const childStore = await parent.createDataStore(factory);
		const child = (await childStore.entryPoint.get()) as IFluidDataStoreChannelCollection;
		const leaf = await getRoot(child);
		leaf.set("value", 42);
		root.set("descendant", leaf.handle);
		await provider.ensureSynchronized();
		assert.equal(childStore.entryPoint.isAttached, true);

		const remote = await provider.loadContainer(runtimeFactory);
		const remoteRoot = await getRoot(
			(await remote.getEntryPoint()) as IFluidDataStoreChannelCollection,
		);
		await provider.ensureSynchronized();
		const handle = remoteRoot.get<IFluidHandle<ISharedMap>>("descendant");
		assert(handle !== undefined);
		assert.equal((await handle.get()).get("value"), 42);
	});

	it("preserves nested identities and aliases across summary reload", async () => {
		const container = await provider.createContainer(runtimeFactory);
		const parent = (await container.getEntryPoint()) as IFluidDataStoreChannelCollection;
		const root = await getRoot(parent);
		const childStore = await parent.createDataStore(factory);
		const child = (await childStore.entryPoint.get()) as IFluidDataStoreChannelCollection;
		const leaf = await getRoot(child);
		leaf.set("value", 42);
		assert.equal(await childStore.trySetAlias("named"), "Success");
		root.set("child", childStore.entryPoint);
		await provider.ensureSynchronized();

		const loader = provider.createLoader([[provider.defaultCodeDetails, runtimeFactory]]);
		const { summarizer } = await createSummarizerCore(container, loader);
		const { summaryVersion } = await summarizeNow(summarizer);
		const remote = await provider.loadContainer(runtimeFactory, undefined, {
			[LoaderHeader.version]: summaryVersion,
		});
		const parent2 = (await remote.getEntryPoint()) as IFluidDataStoreChannelCollection;
		const child2 = (await (
			await parent2.getDataStoreEntryPoint("named")
		).get()) as IFluidDataStoreChannelCollection;
		assert.equal((await getRoot(child2)).get("value"), 42);

		const graph = await parent2.getGCData();
		const rootPath = toFluidHandleInternal(parent2.entryPoint).absolutePath;
		assert(graph.gcNodes["/root"]?.includes(rootPath));
		assert(graph.gcNodes["/"]?.includes(`${rootPath}/root`));
	});

	it("rejects a client compatibility target older than native nesting", async () => {
		const incompatibleFactory = new ContainerRuntimeFactoryWithDefaultDataStore({
			defaultFactory: factory,
			registryEntries: [[factory.type, factory]],
			oldestSupportedClient: "3.11.0",
		});
		const container = await provider.createContainer(incompatibleFactory);
		const parent = (await container.getEntryPoint()) as IFluidDataStoreChannelCollection;
		await assert.rejects(
			parent.createDataStore(factory, "rejected"),
			/Nested data stores require oldestSupportedClient >= 3.12.0/,
		);
		const leaf = await parent.createDataStore(leafFactory, "accepted");
		await assert.rejects(leaf.trySetAlias("unsupported"), /Nested channel aliases require/);
		// Rejection must not reserve IDs, persist aliases, or prevent subsequent supported operations.
		const reused = await parent.createDataStore(leafFactory, "rejected");
		parent.bind(reused.entryPoint);
		parent.bind(leaf.entryPoint);
		(await getRoot(parent)).set("still-usable", true);
		await provider.ensureSynchronized();
		const summary = await parent.summarize(true, false);
		assert.equal(summary.summary.tree[".aliases"], undefined);
		const child = summary.summary.tree.rejected;
		assert(child?.type === SummaryType.Tree);
		assert.equal(child.tree[".component"], undefined);
		assert.equal(child.tree[".channels"], undefined);
		const remote = await provider.loadContainer(incompatibleFactory);
		await provider.ensureSynchronized();
		assert.equal(
			(await getRoot((await remote.getEntryPoint()) as IFluidDataStoreChannelCollection)).get(
				"still-usable",
			),
			true,
		);
	});

	it("rejects invalid and duplicate child IDs without replacing existing contents", async () => {
		const container = await provider.createContainer(runtimeFactory);
		const collection = (await container.getEntryPoint()) as IFluidDataStoreChannelCollection;
		const root = await getRoot(collection);
		root.set("value", 42);
		for (const id of ["", "a/b", "root"]) {
			await assert.rejects(
				collection.createDataStore(leafFactory, id),
				/Invalid or duplicate child channel ID/,
			);
		}
		assert.equal(await getRoot(collection), root);
		assert.equal(root.get("value"), 42);
		const child = await collection.createDataStore(leafFactory, "valid");
		assert.equal(await child.trySetAlias("reserved"), "Success");
		await assert.rejects(
			collection.createDataStore(leafFactory, "reserved"),
			/Invalid or duplicate child channel ID/,
		);
	});

	it("allows a composite channel to be the root of another composite", async () => {
		const rootFactory: IFluidDataStoreFactory & {
			IFluidDataStoreRegistry: IFluidDataStoreRegistry;
		} = {
			type: "composite-root",
			IFluidDataStoreRegistry: registry,
			get IFluidDataStoreFactory() {
				return this;
			},
			async instantiateDataStore(context, existing) {
				const nativeContext = context as FluidDataStoreContextInternal;
				assert(nativeContext.createChannelCollection !== undefined);
				return nativeContext.createChannelCollection(async (collection) => {
					if (!existing) {
						const createdRoot = await collection.createDataStore(factory, "root");
						collection.bind(createdRoot.entryPoint);
					}
					return (await collection.getDataStoreEntryPoint("root")).get();
				});
			},
		};
		const outerFactory = new ContainerRuntimeFactoryWithDefaultDataStore({
			defaultFactory: rootFactory,
			registryEntries: [[rootFactory.type, rootFactory]],
			oldestSupportedClient: "3.12.0",
		});
		const container = await provider.createContainer(outerFactory);
		const root = await getRoot(
			(await container.getEntryPoint()) as IFluidDataStoreChannelCollection,
		);
		root.set("value", 42);
		await provider.ensureSynchronized();
		const remote = await provider.loadContainer(outerFactory);
		await provider.ensureSynchronized();
		const root2 = await getRoot(
			(await remote.getEntryPoint()) as IFluidDataStoreChannelCollection,
		);
		assert.equal(root2.get("value"), 42);
	});

	it("hosts legacy data stores alongside native leaves", async () => {
		const container = await provider.createContainer(runtimeFactory);
		const collection = (await container.getEntryPoint()) as IFluidDataStoreChannelCollection;
		const root = await getRoot(collection);
		const legacyStore = await collection.createDataStore(legacyFactory);
		const legacy = (await legacyStore.entryPoint.get()) as ITestFluidObject;
		legacy.root.set("leaf", root.handle);
		root.set("legacy", legacyStore.entryPoint);
		await provider.ensureSynchronized();
		const remote = await provider.loadContainer(runtimeFactory);
		const remoteRoot = await getRoot(
			(await remote.getEntryPoint()) as IFluidDataStoreChannelCollection,
		);
		await provider.ensureSynchronized();
		const handle = remoteRoot.get<IFluidHandle<ITestFluidObject>>("legacy");
		assert(handle !== undefined);
		const legacy2 = await handle.get();
		const leafHandle = legacy2.root.get<IFluidHandle<ISharedMap>>("leaf");
		assert(leafHandle !== undefined);
		assert.equal(await leafHandle.get(), remoteRoot);
		assert.deepEqual(legacy2.context.packagePath, [factory.type, legacyFactory.type]);
	});

	it("rehydrates nested stashed operations and rolls back staged changes", async () => {
		const container = await provider.createContainer(runtimeFactory);
		const collection = (await container.getEntryPoint()) as IFluidDataStoreChannelCollection;
		const root = await getRoot(collection);
		const legacyStore = await collection.createDataStore(legacyFactory);
		const legacy = (await legacyStore.entryPoint.get()) as ITestFluidObject;
		root.set("legacy", legacyStore.entryPoint);
		root.set("value", 1);
		await provider.ensureSynchronized();
		const staging = legacy.context.containerRuntime.enterStagingMode();
		root.set("value", 2);
		staging.discardChanges();
		assert.equal(root.get("value"), 1);

		await provider.opProcessingController.pauseProcessing(container);
		root.set("value", 42);
		const pending = await getRequiredPendingLocalState(container);
		container.close();
		provider.opProcessingController.resumeProcessing();
		const reloaded = await provider.loadContainer(
			runtimeFactory,
			undefined,
			undefined,
			pending,
		);
		const reloadedRoot = await getRoot(
			(await reloaded.getEntryPoint()) as IFluidDataStoreChannelCollection,
		);
		assert.equal(reloadedRoot.get("value"), 42);
		await provider.ensureSynchronized();
	});

	it("routes signals to a nested data store without changing its application payload", async () => {
		const container = await provider.createContainer(runtimeFactory);
		const collection = (await container.getEntryPoint()) as IFluidDataStoreChannelCollection;
		const root = await getRoot(collection);
		const childStore = await collection.createDataStore(legacyFactory);
		const child = (await childStore.entryPoint.get()) as ITestFluidObject;
		root.set("child", childStore.entryPoint);
		await provider.ensureSynchronized();
		const remote = await provider.loadContainer(runtimeFactory);
		const remoteRoot = await getRoot(
			(await remote.getEntryPoint()) as IFluidDataStoreChannelCollection,
		);
		await provider.ensureSynchronized();
		const handle = remoteRoot.get<IFluidHandle<ITestFluidObject>>("child");
		assert(handle !== undefined);
		const remoteChild = await handle.get();
		await Promise.all([
			waitForContainerConnection(container),
			waitForContainerConnection(remote),
		]);
		const received = new Promise<unknown>((resolve) => {
			remoteChild.runtime.on("signal", (message, local) => {
				if (!local && message.type === "nested") resolve(message.content);
			});
		});
		const payload = { address: "application-payload", contents: 42 };
		child.runtime.submitSignal("nested", payload);
		assert.deepEqual(await received, payload);
	});

	it("targets a nested store on one client without signaling sibling stores or other clients", async () => {
		const container = await provider.createContainer(runtimeFactory);
		const collection = (await container.getEntryPoint()) as IFluidDataStoreChannelCollection;
		const root = await getRoot(collection);
		const childStore = await collection.createDataStore(legacyFactory);
		const siblingStore = await collection.createDataStore(legacyFactory);
		root.set("child", childStore.entryPoint);
		root.set("sibling", siblingStore.entryPoint);
		const child = (await childStore.entryPoint.get()) as ITestFluidObject;
		await provider.ensureSynchronized();
		const remote = await provider.loadContainer(runtimeFactory);
		const other = await provider.loadContainer(runtimeFactory);
		await Promise.all([
			waitForContainerConnection(container),
			waitForContainerConnection(remote),
			waitForContainerConnection(other),
		]);
		await provider.ensureSynchronized();
		const remoteRoot = await getRoot(
			(await remote.getEntryPoint()) as IFluidDataStoreChannelCollection,
		);
		const otherRoot = await getRoot(
			(await other.getEntryPoint()) as IFluidDataStoreChannelCollection,
		);
		const getChild = async (map: ISharedMap, key: string): Promise<ITestFluidObject> => {
			const handle = map.get<IFluidHandle<ITestFluidObject>>(key);
			assert(handle !== undefined);
			return handle.get();
		};
		const target = await getChild(remoteRoot, "child");
		const sibling = await getChild(remoteRoot, "sibling");
		const otherChild = await getChild(otherRoot, "child");
		await provider.ensureSynchronized();
		assert(remote.clientId !== undefined);
		const received = timeoutPromise<unknown>((resolve) => {
			target.runtime.once("signal", (message) => resolve(message.content));
		});
		let unexpectedSignalCount = 0;
		const onUnexpectedSignal = (): void => {
			unexpectedSignalCount++;
		};
		const otherRuntimes = [sibling.runtime, otherChild.runtime];
		for (const runtime of otherRuntimes) {
			runtime.on("signal", onUnexpectedSignal);
		}
		try {
			const payload = { address: "application-payload", contents: 42 };
			child.runtime.submitSignal("targeted", payload, remote.clientId);
			const [content] = await Promise.all([received, delay(100)]);
			assert.deepEqual(content, payload);
			assert.equal(unexpectedSignalCount, 0, "Signal delivered outside its target");
		} finally {
			for (const runtime of otherRuntimes) {
				runtime.off("signal", onUnexpectedSignal);
			}
		}
	});

	describe("garbage-collection lifetime", () => {
		const tombstoneTimeoutMs = 100;
		const sweepGracePeriodMs = 1000;
		const configProvider = createTestConfigProvider();
		beforeEach(function () {
			provider = getTestObjectProvider({ syncSummarizer: true });
			if (provider.driver.type !== "local") this.skip();
			configProvider.set(
				"Fluid.GarbageCollection.TestOverride.TombstoneTimeoutMs",
				tombstoneTimeoutMs,
			);
		});
		afterEach(() => configProvider.clear());

		for (const shape of ["composite", "leaf"] as const) {
			it(`retains and then tombstones and sweeps a container-level ${shape}`, async function () {
				this.timeout(10000);
				const makeGcFactory = (isSummarizer: boolean) =>
					new ContainerRuntimeFactoryWithDefaultDataStore({
						defaultFactory: factory,
						registryEntries: [
							[factory.type, factory],
							[leafFactory.type, leafFactory],
						],
						oldestSupportedClient: "3.12.0",
						runtimeOptions: {
							gcOptions: { enableGCSweep: true, inactiveTimeoutMs: 0, sweepGracePeriodMs },
							summaryOptions: {
								summaryConfigOverrides: {
									state: isSummarizer ? "disableHeuristics" : "disabled",
									initialSummarizerDelayMs: 0,
									maxAckWaitTime: 20000,
									maxOpsSinceLastSummary: 7000,
								},
							},
						},
					});
				const gcFactory = makeGcFactory(false);
				const container = await provider.createContainer(gcFactory, { configProvider });
				const rootCollection =
					(await container.getEntryPoint()) as IFluidDataStoreChannelCollection;
				const root = await getRoot(rootCollection);
				const controlStore = await rootCollection.createDataStore(legacyFactory);
				root.set("control", controlStore.entryPoint);
				const control = (await controlStore.entryPoint.get()) as ITestFluidObject;
				const runtime = control.context.containerRuntime;
				const subject = await runtime.createDataStore(
					shape === "composite" ? factory.type : leafFactory.type,
				);
				const subjectPath = toFluidHandleInternal(subject.entryPoint).absolutePath;
				const retainedPaths = [subjectPath];
				let reference: IFluidHandle;
				if (shape === "composite") {
					const aggregate =
						(await subject.entryPoint.get()) as IFluidDataStoreChannelCollection;
					const nestedStore = await aggregate.createDataStore(factory, "nested");
					aggregate.bind(nestedStore.entryPoint);
					const nested =
						(await nestedStore.entryPoint.get()) as IFluidDataStoreChannelCollection;
					const descendant = await getRoot(nested);
					// No external handle references the aggregate, its root, or this sibling.
					const sibling = await aggregate.createDataStore(leafFactory, "sibling");
					aggregate.bind(sibling.entryPoint);
					reference = descendant.handle;
					retainedPaths.push(
						`${subjectPath}/root`,
						`${subjectPath}/nested`,
						`${subjectPath}/nested/root`,
						`${subjectPath}/sibling`,
					);
				} else {
					reference = ((await subject.entryPoint.get()) as ISharedMap).handle;
				}
				root.set("subject", reference);
				const survivor = await runtime.createDataStore(leafFactory.type);
				const survivorMap = (await survivor.entryPoint.get()) as ISharedMap;
				survivorMap.set("value", 42);
				root.set("survivor", survivorMap.handle);
				await provider.ensureSynchronized();
				const loader = provider.createLoader(
					[[provider.defaultCodeDetails, makeGcFactory(true)]],
					{
						configProvider,
					},
				);
				const { summarizer } = await createSummarizerCore(container, loader);
				let summary = await summarizeNow(summarizer);
				const retained = getGCStateFromSummary(summary.summaryTree);
				assert(retained !== undefined);
				for (const path of retainedPaths) {
					assert(retained.gcNodes[path] !== undefined, `Missing ${path}`);
					assert.equal(retained.gcNodes[path].unreferencedTimestampMs, undefined, path);
				}
				root.delete("subject");
				await provider.ensureSynchronized();
				summary = await summarizeNow(summarizer);
				const unreferenced = getGCStateFromSummary(summary.summaryTree);
				assert(unreferenced !== undefined);
				for (const path of retainedPaths) {
					assert(unreferenced.gcNodes[path]?.unreferencedTimestampMs !== undefined, path);
				}
				await delay(tombstoneTimeoutMs + 10);
				root.set("advance-timestamp", 1);
				await provider.ensureSynchronized();
				summary = await summarizeNow(summarizer);
				assert(getGCTombstoneStateFromSummary(summary.summaryTree)?.includes(subjectPath));
				assert(
					!getGCTombstoneStateFromSummary(summary.summaryTree)?.includes(
						toFluidHandleInternal(survivor.entryPoint).absolutePath,
					),
				);
				await delay(sweepGracePeriodMs + 10);
				root.set("advance-timestamp", 2);
				await provider.ensureSynchronized();
				// Production sweep happens after the creating session expires.
				container.close();
				await summarizeNow(summarizer);
				await provider.ensureSynchronized();
				summary = await summarizeNow(summarizer);
				const deleted = getGCDeletedStateFromSummary(summary.summaryTree);
				assert(deleted !== undefined);
				for (const path of retainedPaths) assert(deleted.includes(path), path);
				const channels = summary.summaryTree.tree[".channels"];
				assert(channels?.type === SummaryType.Tree);
				assert.equal(channels.tree[subjectPath.slice(1)], undefined);
				const reloaded = await provider.loadContainer(
					gcFactory,
					{ configProvider },
					{ [LoaderHeader.version]: summary.summaryVersion },
				);
				const reloadedRoot = await getRoot(
					(await reloaded.getEntryPoint()) as IFluidDataStoreChannelCollection,
				);
				const survivingHandle = reloadedRoot.get<IFluidHandle<ISharedMap>>("survivor");
				assert(survivingHandle !== undefined);
				assert.equal((await survivingHandle.get()).get("value"), 42);
				assert.equal(reloadedRoot.has("subject"), false);
			});
		}
	});
});
