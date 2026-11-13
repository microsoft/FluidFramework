/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "assert";

import { describeCompat, itExpects } from "@fluid-private/test-version-utils";
import { finishLoggingReport, ValueType, type Measurement } from "@fluid-tools/benchmark";
import { LoaderHeader, type IContainer } from "@fluidframework/container-definitions/internal";
import type { ContainerRuntime as ContainerRuntimeType } from "@fluidframework/container-runtime/internal";
import type { IFluidHandle } from "@fluidframework/core-interfaces";
import { DriverHeader, SummaryType } from "@fluidframework/driver-definitions/internal";
import type { ISharedDirectory } from "@fluidframework/map/internal";
import type { SharedMatrix } from "@fluidframework/matrix/internal";
import type { SharedString } from "@fluidframework/sequence/internal";
import { toFluidHandleInternal } from "@fluidframework/runtime-utils/internal";
import { SharedSummaryBlock } from "@fluidframework/shared-summary-block/internal";
import {
	createSummarizerFromFactory,
	createTestConfigProvider,
	defaultTestOldestSupportedClient,
	summarizeNow,
	timeoutAwait,
	waitForContainerConnection,
} from "@fluidframework/test-utils/internal";
import type { ITree, TreeView } from "@fluidframework/tree";

interface ExpectedStore {
	title: string;
	text: string;
	style: string;
	cells: string[][];
	directory: Record<string, string>;
	tree: { id: string; value: number }[];
	image: number;
}

describeCompat("Native checkpoint model", "NoCompat", (getTestObjectProvider, apis) => {
	const { ContainerRuntime, ContainerRuntimeFactoryWithDefaultDataStore } =
		apis.containerRuntime;
	const { SharedString, SharedMatrix, SharedDirectory, SharedTree } = apis.dds;
	const { DataObject, DataObjectFactory, FluidDataStoreRuntime } = apis.dataRuntime;
	const { mixinSummaryHandler } = apis.dataRuntime.packages.datastore;
	const { SchemaFactory, TreeViewConfiguration } = apis.dataRuntime.packages.tree;
	const schema = new SchemaFactory("NativeCheckpointModel");
	class Item extends schema.object("Item", { id: schema.identifier, value: schema.number }) {}
	class Items extends schema.array("Items", Item) {}
	const treeConfiguration = new TreeViewConfiguration({ schema: Items });

	const registry = [
		["text", SharedString.getFactory()],
		["table", SharedMatrix.getFactory()],
		["directory", SharedDirectory.getFactory()],
		["block", SharedSummaryBlock.getFactory()],
		["tree", SharedTree.getFactory()],
	] satisfies import("@fluidframework/test-utils/internal").ChannelFactoryRegistry;

	class ModelObject extends DataObject {
		public override get root(): ISharedDirectory {
			return super.root;
		}

		public get containerRuntime(): ContainerRuntimeType {
			const runtime = this.context.containerRuntime;
			assert(runtime instanceof ContainerRuntime);
			return runtime;
		}

		public async getSharedObject<T>(id: string): Promise<T> {
			const handle = this.root.get<IFluidHandle<T>>(id);
			assert(handle !== undefined);
			return handle.get();
		}

		protected override async initializingFirstTime(): Promise<void> {
			for (const [id, channelFactory] of registry) {
				this.root.set(id, this.runtime.createChannel(id, channelFactory.type).handle);
			}
		}

		protected override async hasInitialized(): Promise<void> {
			const block = await this.getSharedObject<SharedSummaryBlock>("block");
			block.set("derived", { title: this.root.get<string>("title") ?? "" });
			// Derive summary-only state from acknowledged map operations, not local optimistic edits.
			this.root.on("op", () => {
				block.set("derived", { title: this.root.get<string>("title") ?? "" });
			});
		}
	}

	const factory = new DataObjectFactory({
		type: "native-checkpoint-model",
		ctor: ModelObject,
		sharedObjects: registry.map(([, channelFactory]) => channelFactory),
		runtimeClass: mixinSummaryHandler(async (runtime) => {
			await DataObject.getDataObject(runtime);
			return undefined;
		}, FluidDataStoreRuntime),
	});
	const runtimeFactory = new ContainerRuntimeFactoryWithDefaultDataStore({
		defaultFactory: factory,
		oldestSupportedClient: defaultTestOldestSupportedClient,
		registryEntries: [[factory.type, Promise.resolve(factory)]],
		runtimeOptions: {
			enableRuntimeIdCompressor: "on",
			summaryOptions: { summaryConfigOverrides: { state: "disabled" } },
		},
	});
	const configProvider = createTestConfigProvider({
		"Fluid.ContainerRuntime.NativeCheckpoints": true,
	});
	const loaderProps = { configProvider };

	interface Store {
		entry: ModelObject;
		text: SharedString;
		table: SharedMatrix<string>;
		directory: ISharedDirectory;
		block: SharedSummaryBlock;
		tree: TreeView<typeof Items>;
	}

	async function getRoot(container: IContainer): Promise<ModelObject> {
		const root = await container.getEntryPoint();
		assert(root instanceof ModelObject);
		return root;
	}

	async function getRuntime(container: IContainer): Promise<ContainerRuntimeType> {
		return (await getRoot(container)).containerRuntime;
	}

	async function loadStore(entry: ModelObject, initialize: boolean): Promise<Store> {
		const tree = (await entry.getSharedObject<ITree>("tree")).viewWith(treeConfiguration);
		if (initialize) {
			tree.initialize([{ value: 0 }]);
		}
		return {
			entry,
			text: await entry.getSharedObject<SharedString>("text"),
			table: await entry.getSharedObject<SharedMatrix<string>>("table"),
			directory: await entry.getSharedObject<ISharedDirectory>("directory"),
			block: await entry.getSharedObject<SharedSummaryBlock>("block"),
			tree,
		};
	}

	async function loadStores(container: IContainer): Promise<Store[]> {
		const root = await getRoot(container);
		const handles = root.root.get<IFluidHandle<ModelObject>[]>("stores");
		assert(handles !== undefined);
		return Promise.all(handles.map(async (handle) => loadStore(await handle.get(), false)));
	}

	function disposeViews(stores: readonly Store[]): void {
		for (const store of stores) {
			store.tree.dispose();
		}
	}

	async function validateStores(
		container: IContainer,
		stores: readonly Store[],
		expected: readonly ExpectedStore[],
	): Promise<void> {
		assert.equal(stores.length, expected.length, "Restored datastore count");
		const runtime = await getRuntime(container);
		const verifiedImages = new Map<number, string>();
		for (const [index, store] of stores.entries()) {
			const oracle = expected[index];
			assert(oracle !== undefined);
			assert.equal(store.entry.root.get("title"), oracle.title);
			assert.equal(store.text.getText(), oracle.text);
			assert.equal(store.text.getPropertiesAtPosition(0)?.style, oracle.style);
			assert.equal(
				store.text.getPropertiesAtPosition(oracle.text.length - 1)?.style,
				oracle.style,
			);
			assert.deepEqual(store.block.get("derived"), { title: oracle.title });
			assert.deepEqual(store.block.get("opaque"), {
				index,
				flags: [true, false],
				text: `summary-only-${index}`,
			});
			assert.equal(store.table.rowCount, oracle.cells.length);
			assert.equal(store.table.colCount, oracle.cells[0]?.length);
			for (const [row, cells] of oracle.cells.entries()) {
				for (const [column, value] of cells.entries()) {
					assert.equal(store.table.getCell(row, column), value);
				}
			}
			assert.deepEqual(Object.fromEntries(store.directory.entries()), oracle.directory);
			assert.equal(store.directory.getSubDirectory("nested")?.get("owner"), index);
			assert.deepEqual(
				Array.from(store.tree.root, (item) => ({ id: item.id, value: item.value })),
				oracle.tree,
			);
			const alias = await runtime.getAliasedDataStoreEntryPoint(`item-${index}`);
			assert(alias !== undefined);
			assert.equal(
				await alias.get(),
				store.entry,
				"Alias must resolve to the restored datastore",
			);
			const next = store.entry.root.get<IFluidHandle<ModelObject>>("next");
			assert(next !== undefined);
			assert.equal(
				await next.get(),
				stores[(index + 1) % stores.length]?.entry,
				"Cross-store handle",
			);
			const image = store.entry.root.get<IFluidHandle<ArrayBufferLike>>("image");
			assert(image !== undefined);
			const path = toFluidHandleInternal(image).absolutePath;
			const previous = verifiedImages.get(oracle.image);
			if (previous === undefined) {
				assert.deepEqual(
					new Uint8Array(await image.get()),
					new Uint8Array(64 * 1024).fill(oracle.image),
				);
				verifiedImages.set(oracle.image, path);
			} else {
				assert.equal(path, previous, "Datastores must share the same attachment, not copies");
			}
		}
	}

	for (const profile of [
		{ seed: 7, stores: 8, textLength: 1024 },
		{ seed: 91, stores: 64, textLength: 8192 },
	]) {
		const rounds = 3;
		itExpects(
			`random edits and repeated restores (${profile.stores} stores, seed ${profile.seed})`,
			Array.from({ length: rounds * 3 }, (_value, index) => ({
				eventName:
					index % 3 === 2
						? "fluid:telemetry:Container:ContainerDispose"
						: "fluid:telemetry:Container:ContainerClose",
				error: "Native checkpoint restored: reload without cached or pending state",
			})),
			async function () {
				this.timeout(180_000);
				const provider = getTestObjectProvider({ syncSummarizer: true });
				let source = await timeoutAwait(
					provider.createContainer(runtimeFactory, loaderProps),
					{
						durationMs: 20000,
						errorMsg: "Creating the model container",
					},
				);
				await waitForContainerConnection(source);
				let runtime = await getRuntime(source);
				let root = await getRoot(source);
				let stores: Store[] = [];
				let peerStores: Store[] = [];
				let expected: ExpectedStore[] = [];
				const snapshots = new Map<string, ExpectedStore[]>();
				const captureTimes: number[] = [];
				const coldCaptureTimes: number[] = [];
				const restoreTimes: number[] = [];
				const payloadSizes: number[] = [];
				const modelOperations = new Set<number>();
				let random = profile.seed;
				function getRandom(limit: number): number {
					random = (random * 1664525 + 1013904223) % 4294967296;
					return Math.floor((random / 4294967296) * limit);
				}
				const images = await Promise.all(
					[17, 91].map(async (fill) =>
						runtime.uploadBlob(new Uint8Array(64 * 1024).fill(fill).buffer),
					),
				);
				root.root.set("images", images);

				async function createStore(index: number): Promise<void> {
					provider.opProcessingController.resumeProcessing();
					const dataStore = await runtime.createDataStore(factory.type);
					const entry = await dataStore.entryPoint.get();
					assert(entry instanceof ModelObject);
					const store = await loadStore(entry, true);
					store.block.set("opaque", {
						index,
						flags: [true, false],
						text: `summary-only-${index}`,
					});
					const text = `${index}:`.padEnd(
						profile.textLength,
						String.fromCodePoint(65 + (index % 26)),
					);
					entry.root.set("title", `store-${index}`);
					const currentImages = root.root.get<IFluidHandle<ArrayBufferLike>[]>("images");
					assert(currentImages !== undefined);
					entry.root.set("image", currentImages[0]);
					store.text.insertText(0, text, { style: "initial" });
					store.table.insertRows(0, 2);
					store.table.insertCols(0, 2);
					const cells = [
						["a", "b"],
						["c", "d"],
					];
					for (const [row, values] of cells.entries()) {
						for (const [column, value] of values.entries()) {
							store.table.setCell(row, column, value);
						}
					}
					store.directory.set("revision", "initial");
					store.directory.createSubDirectory("nested").set("owner", index);
					assert.equal(
						await timeoutAwait(dataStore.trySetAlias(`item-${index}`), {
							durationMs: 20000,
							errorMsg: `Aliasing model datastore ${index}`,
						}),
						"Success",
					);
					stores.push(store);
					expected.push({
						title: `store-${index}`,
						text,
						style: "initial",
						cells,
						directory: { revision: "initial" },
						tree: Array.from(store.tree.root, (item) => ({ id: item.id, value: item.value })),
						image: 17,
					});
				}

				async function linkStores(): Promise<void> {
					root.root.set(
						"stores",
						stores.map((store) => store.entry.handle),
					);
					for (const [index, store] of stores.entries()) {
						store.entry.root.set("next", stores[(index + 1) % stores.length]?.entry.handle);
					}
					await provider.ensureSynchronized();
				}

				try {
					for (let index = 0; index < profile.stores; index++) {
						await createStore(index);
					}
					await linkStores();
					let peer = await provider.loadContainer(runtimeFactory, loaderProps);
					await waitForContainerConnection(peer);
					await provider.ensureSynchronized();
					peerStores = await loadStores(peer);
					const baseline = await runtime.summarize({
						fullTree: true,
						trackState: false,
						runGC: false,
					});
					for (let round = 0; round < rounds; round++) {
						const { summarizer } = await createSummarizerFromFactory(
							provider,
							source,
							factory,
							undefined,
							ContainerRuntimeFactoryWithDefaultDataStore,
							undefined,
							undefined,
							configProvider,
						);
						try {
							await summarizeNow(summarizer);
							for (let point = 0; point < 8; point++) {
								for (let edit = 0; edit < 6; edit++) {
									const index = getRandom(stores.length);
									const store = (getRandom(2) === 0 ? stores : peerStores)[index];
									const oracle = expected[index];
									assert(store !== undefined && oracle !== undefined);
									const value = `${round}:${point}:${edit}:${random}`;
									const operation = getRandom(6);
									modelOperations.add(operation);
									switch (operation) {
										case 0: {
											store.entry.root.set("title", value);
											oracle.title = value;
											break;
										}
										case 1: {
											const position = getRandom(oracle.text.length);
											const remove = Math.min(getRandom(5), oracle.text.length - position);
											store.text.replaceText(position, position + remove, value);
											oracle.text =
												oracle.text.slice(0, position) +
												value +
												oracle.text.slice(position + remove);
											oracle.style = `style-${getRandom(4)}`;
											store.text.annotateRange(0, oracle.text.length, { style: oracle.style });
											break;
										}
										case 2: {
											const matrixOperation = getRandom(4);
											const columns = oracle.cells[0]?.length;
											assert(columns !== undefined);
											if (matrixOperation === 0 && oracle.cells.length < 6) {
												const row = oracle.cells.length;
												store.table.insertRows(row, 1);
												const added = Array.from({ length: columns }, () => value);
												oracle.cells.push(added);
												for (const [column, cell] of added.entries()) {
													store.table.setCell(row, column, cell);
												}
												break;
											}
											if (matrixOperation === 1 && oracle.cells.length > 1) {
												store.table.removeRows(0, 1);
												oracle.cells.shift();
												break;
											}
											if (matrixOperation === 2 && columns < 6) {
												store.table.insertCols(columns, 1);
												for (const [row, cells] of oracle.cells.entries()) {
													cells.push(value);
													store.table.setCell(row, columns, value);
												}
												break;
											}
											const selectedRow = getRandom(oracle.cells.length);
											const selectedCells = oracle.cells[selectedRow];
											assert(selectedCells !== undefined);
											const selectedColumn = getRandom(selectedCells.length);
											store.table.setCell(selectedRow, selectedColumn, value);
											selectedCells[selectedColumn] = value;
											break;
										}
										case 3: {
											const key = `key-${getRandom(5)}`;
											if (getRandom(2) === 0) {
												store.directory.set(key, value);
												oracle.directory[key] = value;
											} else {
												store.directory.delete(key);
												Reflect.deleteProperty(oracle.directory, key);
											}
											break;
										}
										case 4: {
											if (store.tree.root.length > 1 && getRandom(2) === 0) {
												store.tree.root.removeAt(0);
												oracle.tree.shift();
											} else {
												const number = getRandom(10000);
												store.tree.root.insertAtEnd({ value: number });
												const inserted = store.tree.root.at(-1);
												assert(inserted !== undefined);
												oracle.tree.push({ id: inserted.id, value: number });
											}
											break;
										}
										case 5: {
											const slot = getRandom(2);
											const currentImages =
												root.root.get<IFluidHandle<ArrayBufferLike>[]>("images");
											assert(currentImages !== undefined);
											store.entry.root.set("image", currentImages[slot]);
											oracle.image = slot === 0 ? 17 : 91;
											break;
										}
										default: {
											assert.fail("Unexpected model operation");
										}
									}
									await provider.ensureSynchronized();
								}
								await validateStores(source, stores, expected);
								const id = `${round}-${point}`;
								snapshots.set(id, structuredClone(expected));
								const start = performance.now();
								const checkpoint = await runtime.createNativeCheckpoint(id);
								await provider.ensureSynchronized();
								captureTimes.push(performance.now() - start);
								payloadSizes.push(checkpoint.bytes);
								assert.equal(checkpoint.assets.length, 2, "All stores share two image blobs");
								if (point % 4 === 3) {
									await summarizeNow(summarizer);
								}
							}
							const { summaryVersion, summaryTree } = await summarizeNow(summarizer);
							assert(summaryTree.tree[".nativeCheckpoints"] !== undefined);
							const worker = await provider.loadContainer(runtimeFactory, loaderProps, {
								[LoaderHeader.version]: summaryVersion,
								[LoaderHeader.clientDetails]: {
									capabilities: { interactive: false },
									type: "summarizer",
								},
								[DriverHeader.summarizingClient]: true,
							});
							await waitForContainerConnection(worker);
							await provider.ensureSynchronized();
							const publisher = await getRuntime(worker);
							// The cold worker must realize all datastores, including summary-only state.
							const coldId = `cold-${round}`;
							const coldCaptureStart = performance.now();
							const cold = await publisher.createNativeCheckpoint(coldId);
							await provider.ensureSynchronized();
							coldCaptureTimes.push(performance.now() - coldCaptureStart);
							payloadSizes.push(cold.bytes);
							assert(cold.bytes > 0);
							snapshots.set(coldId, structuredClone(expected));
							const choices = [...snapshots.keys()];
							const selectedId =
								round === 0
									? `0-${getRandom(7)}`
									: round === 1
										? "cold-0"
										: choices[getRandom(choices.length)];
							assert(selectedId !== undefined);
							const selectedSnapshot = snapshots.get(selectedId);
							assert(selectedSnapshot !== undefined);
							summarizer.close();
							const restoreStart = performance.now();
							runtime.requestNativeCheckpointRestore(`restore-${round}`, selectedId);
							await provider.ensureSynchronized();
							provider.opProcessingController.resumeProcessing();
							await publisher.publishNativeCheckpointRestore();
							await provider.ensureSynchronized();
							assert(source.closed && peer.closed && worker.closed);
							disposeViews(stores);
							disposeViews(peerStores);
							stores = [];
							peerStores = [];
							source = await provider.loadContainer(runtimeFactory, loaderProps);
							await waitForContainerConnection(source);
							runtime = await getRuntime(source);
							root = await getRoot(source);
							stores = await loadStores(source);
							expected = structuredClone(selectedSnapshot);
							await validateStores(source, stores, expected);
							restoreTimes.push(performance.now() - restoreStart);
							peer = await provider.loadContainer(runtimeFactory, loaderProps);
							await waitForContainerConnection(peer);
							await provider.ensureSynchronized();
							peerStores = await loadStores(peer);
							await validateStores(peer, peerStores, expected);
							assert.equal(runtime.getNativeCheckpoints().length, snapshots.size);
							if (round + 1 < rounds) {
								// Reuse a historical alias only when the restored document no longer owns it.
								await createStore(stores.length);
								await linkStores();
								disposeViews(peerStores);
								peerStores = await loadStores(peer);
							}
						} finally {
							summarizer.close();
						}
					}
					assert.deepEqual([...modelOperations].sort(), [0, 1, 2, 3, 4, 5]);
					const metricsPrefix = process.env.FLUID_NATIVE_CHECKPOINT_METRICS_PREFIX;
					if (metricsPrefix !== undefined) {
						const finalSummary = await runtime.summarize({
							fullTree: true,
							trackState: false,
							runGC: false,
						});
						const catalog = finalSummary.summary.tree[".nativeCheckpoints"];
						assert(catalog?.type === SummaryType.Blob && typeof catalog.content === "string");
						const captureP95 = [...captureTimes].sort((left, right) => left - right)[
							Math.ceil(captureTimes.length * 0.95) - 1
						];
						assert(captureP95 !== undefined);
						const measurements: Measurement[] = [
							{
								name: "Warm capture through acknowledgement p95",
								value: captureP95,
								units: "ms",
							},
							{
								name: "Cold capture through acknowledgement mean",
								value:
									coldCaptureTimes.reduce((sum, value) => sum + value, 0) /
									coldCaptureTimes.length,
								units: "ms",
							},
							{
								name: "Restore and validate mean",
								value:
									restoreTimes.reduce((sum, value) => sum + value, 0) / restoreTimes.length,
								units: "ms",
							},
							{
								name: "Checkpoint payload mean",
								value:
									payloadSizes.reduce((sum, value) => sum + value, 0) / payloadSizes.length,
								units: "bytes",
							},
							{
								name: "Checkpoint payload total",
								value: payloadSizes.reduce((sum, value) => sum + value, 0),
								units: "bytes",
							},
							{
								name: "Initial structural summary",
								value: baseline.stats.totalBlobSize,
								units: "bytes",
							},
							{
								name: "Final structural summary",
								value: finalSummary.stats.totalBlobSize,
								units: "bytes",
							},
							{
								name: "Catalog in boot summary",
								value: new TextEncoder().encode(catalog.content).byteLength,
								units: "bytes",
							},
							{
								name: "Retained checkpoints",
								value: runtime.getNativeCheckpoints().length,
								units: "count",
							},
							{ name: "Shared image bytes", value: 2 * 64 * 1024, units: "bytes" },
							{ name: "Initial datastores", value: profile.stores, units: "count" },
							{
								name: "Initial text per datastore",
								value: profile.textLength,
								units: "characters",
							},
						];
						finishLoggingReport(
							{
								content: [
									{
										benchmarkName: `Native checkpoint model (${provider.driver.type}, seed ${profile.seed})`,
										data: [
											{
												name: "Warm capture through acknowledgement mean",
												value:
													captureTimes.reduce((sum, value) => sum + value, 0) /
													captureTimes.length,
												units: "ms",
												type: ValueType.SmallerIsBetter,
												significance: "Primary",
											},
											...measurements,
										],
									},
								],
							},
							false,
							`${metricsPrefix}-model-${profile.seed}.json`,
						);
					}
				} finally {
					disposeViews(stores);
					disposeViews(peerStores);
				}
			},
		);
	}
});
