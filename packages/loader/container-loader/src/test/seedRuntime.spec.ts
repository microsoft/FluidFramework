/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "node:assert";

import {
	bufferToString,
	stringToBuffer,
	TypedEventEmitter,
} from "@fluid-internal/client-utils";
import { AttachState } from "@fluidframework/container-definitions";
import { LoaderHeader } from "@fluidframework/container-definitions/internal";
import type {
	IContainerContext,
	IRuntime,
	IRuntimeFactory,
} from "@fluidframework/container-definitions/internal";
import type { FluidObject } from "@fluidframework/core-interfaces";
import { SummaryType, type ISummaryTree } from "@fluidframework/driver-definitions";
import type {
	IDocumentService,
	IDocumentServiceEvents,
	IDocumentStorageService,
	IResolvedUrl,
	ISnapshot,
	ISnapshotTree,
} from "@fluidframework/driver-definitions/internal";
import { MockLogger, mixinMonitoringContext } from "@fluidframework/telemetry-utils/internal";

import type { SeedLoadContext } from "../containerContext.js";
import { loadExistingContainer } from "../createAndLoadContainerUtils.js";
import {
	assertDeterministicSeedConstruction,
	createSeedRuntimeSnapshot,
	createSeedSummary,
	seedRuntimeFactory,
	type SeedProjector,
	type SeedRuntimeConstructionResult,
	type SeedRuntimeSnapshot,
} from "../seedRuntime.js";
import { getISnapshotFromSerializedContainer } from "../utils.js";

const protocol: ISnapshotTree = { blobs: { attributes: "protocol-attributes" }, trees: {} };
const seed: ISnapshotTree = {
	id: "seed-version",
	blobs: {},
	trees: {
		".protocol": protocol,
		applicationProjection: { blobs: { input: "input" }, trees: {} },
	},
};
const native: SeedRuntimeSnapshot = {
	snapshot: {
		blobs: { ".metadata": "metadata" },
		trees: { ".channels": { blobs: { content: "content" }, trees: {} } },
	},
	blobs: new Map([
		["metadata", stringToBuffer("metadata", "utf8")],
		["content", stringToBuffer("content", "utf8")],
	]),
};

function asSnapshot(tree: ISnapshotTree): ISnapshot {
	return {
		snapshotTree: tree,
		blobContents: new Map([["input", stringToBuffer("seed", "utf8")]]),
		ops: [],
		sequenceNumber: 0,
		latestSequenceNumber: 0,
		snapshotFormatV: 1,
	};
}

function makeContext(overrides: Partial<SeedLoadContext> = {}): SeedLoadContext {
	const storage: IContainerContext["storage"] = {
		getSnapshotTree: async () => seed,
		getSnapshot: async () => asSnapshot(seed),
		async getVersions() {
			assert.equal(this, storage, "Storage methods must retain their receiver");
			return [{ id: "seed-version", treeId: "seed-version" }];
		},
		readBlob: async (id) => stringToBuffer(id, "utf8"),
		createBlob: async () => ({ id: "new-blob" }),
		uploadSummaryWithContext: async () => "new-summary",
	};
	return {
		baseSnapshot: seed,
		storage,
		snapshotWithContents: asSnapshot(seed),
		attachState: AttachState.Attached,
		clientDetails: { capabilities: { interactive: true } },
		deltaManager: { initialSequenceNumber: 0 },
		taggedLogger: new MockLogger(),
		disableOfflineLoad: () => {},
		getLoadedFromVersion: () => ({ id: "seed-version", treeId: "seed-version" }),
		...overrides,
	} as unknown as IContainerContext;
}

function makeProjector(overrides: Partial<SeedProjector> = {}): SeedProjector {
	return {
		isNative: (context) => context.baseSnapshot?.blobs[".metadata"] !== undefined,
		readSeed: async () => "seed",
		materialize: async () => native,
		...overrides,
	};
}

class ConstructionRuntime implements IRuntime {
	public disposed = false;
	public disposeCount = 0;
	public closed = false;
	public summary: ISummaryTree = {
		type: SummaryType.Tree,
		tree: {
			binary: { type: SummaryType.Blob, content: new Uint8Array([0, 128, 255]) },
		},
	};
	readonly #entryPoint: FluidObject = {};
	public async getEntryPoint(): Promise<FluidObject> {
		return this.#entryPoint;
	}
	public setConnectionState(): void {}
	public process(): void {}
	public processSignal(): void {}
	public setAttachState(): void {}
	public getPendingLocalState(): unknown {
		return "pending";
	}
	public createSummary(): ISummaryTree {
		return this.summary;
	}
	public close(): void {
		this.closed = true;
	}
	public dispose(): void {
		this.disposeCount++;
		this.disposed = true;
	}
}

function makeRuntimeFactory(runtime: IRuntime): IRuntimeFactory {
	return {
		get IRuntimeFactory() {
			return this;
		},
		instantiateRuntime: async () => runtime,
	};
}

describe("Seed runtime APIs", () => {
	it("creates protocol and application-only summaries without prescribing an application format", () => {
		const application: ISummaryTree = {
			type: SummaryType.Tree,
			tree: { "input.txt": { type: SummaryType.Blob, content: "hello" } },
		};
		const summary = createSeedSummary({
			codeDetails: { package: "application" },
			applicationProjection: application,
		});
		assert.deepEqual(Object.keys(summary.tree).sort(), [".app", ".protocol"]);
		assert.equal(summary.tree[".app"], application);
		const converted = getISnapshotFromSerializedContainer(summary);
		const attributesId = converted.snapshotTree.trees[".protocol"].blobs.attributes;
		const attributes = converted.blobContents.get(attributesId);
		assert(attributes !== undefined);
		assert.deepEqual(JSON.parse(bufferToString(attributes, "utf8")), {
			minimumSequenceNumber: 0,
			sequenceNumber: 0,
		});
	});

	it("keeps every runtime-facing snapshot view coherent without changing the loader context", async () => {
		const original = Object.freeze(makeContext());
		const runtime = new ConstructionRuntime();
		const factory = seedRuntimeFactory(makeProjector(), async (load, existing) => {
			assert(existing);
			assert(load.fromSeed);
			assert.equal(load.original, original);
			assert.equal(original.baseSnapshot, seed);
			assert.equal(load.context.baseSnapshot?.id, seed.id);
			assert.equal(load.context.baseSnapshot?.trees[".protocol"], protocol);
			assert.equal(load.context.baseSnapshot?.trees.applicationProjection, undefined);
			assert.equal(load.context.deltaManager, original.deltaManager);
			assert.equal(load.context.getLoadedFromVersion()?.id, "seed-version");
			assert.equal(load.context.snapshotWithContents?.snapshotTree, load.context.baseSnapshot);
			assert.equal(
				load.context.snapshotWithContents?.blobContents.get("content"),
				native.blobs.get("content"),
			);
			assert.equal(
				await load.context.storage.readBlob("content"),
				native.blobs.get("content"),
			);
			assert.equal(
				bufferToString(await load.context.storage.readBlob("remote"), "utf8"),
				"remote",
			);
			assert.deepEqual(
				await load.context.storage.getSnapshotTree(),
				load.context.baseSnapshot,
			);
			const fetched = await load.context.storage.getSnapshot?.();
			assert.deepEqual(fetched?.snapshotTree, load.context.baseSnapshot);
			assert.equal(fetched?.blobContents.get("content"), native.blobs.get("content"));
			// eslint-disable-next-line unicorn/no-null -- The storage API uses null to request latest.
			const versions = await load.context.storage.getVersions(null, 1);
			assert.equal(versions[0].id, "seed-version");
			return runtime;
		});
		const loaded = await factory.instantiateRuntime(original, true);
		assert.equal(await loaded.getEntryPoint(), await runtime.getEntryPoint());
		assert.throws(() => loaded.getPendingLocalState(), /Pending\/offline capture/);
		loaded.dispose();
		assert(runtime.disposed);
	});

	it("infers the materializer's seed type from the reader", async () => {
		const input = { title: "seed" };
		let materialized = false;
		const factory = seedRuntimeFactory(
			{
				isNative: () => false,
				readSeed: async () => input,
				materialize: (value, sequenceNumber) => {
					assert.equal(value.title, "seed");
					assert.equal(value, input);
					assert.equal(sequenceNumber, 0);
					materialized = true;
					return native;
				},
			},
			async () => new ConstructionRuntime(),
		);
		const runtime = await factory.instantiateRuntime(makeContext(), true);
		assert(materialized);
		runtime.dispose();
	});

	it("accepts an explicitly typed projector with asynchronous materialization", async () => {
		const input = { title: "seed" };
		let materialized = false;
		const projector: SeedProjector<typeof input> = {
			isNative: () => false,
			readSeed: async () => input,
			materialize: async (value, sequenceNumber) => {
				assert.equal(value.title, "seed");
				assert.equal(value, input);
				assert.equal(sequenceNumber, 0);
				materialized = true;
				return native;
			},
		};
		const factory = seedRuntimeFactory(projector, async () => new ConstructionRuntime());
		const runtime = await factory.instantiateRuntime(makeContext(), true);
		assert(materialized);
		runtime.dispose();
	});

	it("rejects mismatched seed types at compile time", () => {
		const incompatibleProjector = {
			isNative: () => false,
			readSeed: async () => ({ title: "seed" }),
			materialize: (_input: number) => native,
		};
		// @ts-expect-error -- The inferred reader result must match the materializer input.
		seedRuntimeFactory(incompatibleProjector, async () => new ConstructionRuntime());

		const projector: SeedProjector<{ title: string }> = {
			isNative: () => false,
			// @ts-expect-error -- An explicitly typed projector must read its declared seed type.
			readSeed: async () => 123,
			materialize: () => native,
		};
		seedRuntimeFactory(projector, async () => new ConstructionRuntime());
	});

	it("rejects a nonzero checkpoint before reading or materializing application input", async () => {
		const original = makeContext({
			deltaManager: {
				initialSequenceNumber: 1,
			} as unknown as IContainerContext["deltaManager"],
		});
		const fail = (): never => assert.fail("Must not read, materialize, or delegate");
		const factory = seedRuntimeFactory(
			makeProjector({ readSeed: fail, materialize: fail }),
			fail,
		);
		await assert.rejects(factory.instantiateRuntime(original, true), /creation checkpoint/);
	});

	it("passes native and new documents through without seed-only restrictions or runtime wrapping", async () => {
		const runtime = new ConstructionRuntime();
		for (const existing of [true, false]) {
			const original = makeContext({
				baseSnapshot: native.snapshot,
				pendingLocalState: { anything: true },
				attachState: AttachState.Detached,
			});
			const factory = seedRuntimeFactory(
				makeProjector({ readSeed: async () => assert.fail("No seed reads") }),
				async (load) => {
					assert(!load.fromSeed);
					assert.equal(load.context, original);
					return runtime;
				},
				{ allowProjection: false },
			);
			assert.equal(await factory.instantiateRuntime(original, existing), runtime);
		}
	});

	it("rejects other seed versions but passes native refetches through unchanged", async () => {
		let fetched: ISnapshotTree = { ...seed, id: "another-seed" };
		const original = makeContext();
		const context = makeContext({
			storage: {
				...original.storage,
				getSnapshotTree: async () => fetched,
				getSnapshot: async () => asSnapshot(fetched),
			},
		});
		const factory = seedRuntimeFactory(makeProjector(), async (load) => {
			assert(load.context.storage.getSnapshot !== undefined);
			await assert.rejects(load.context.storage.getSnapshotTree(), /another seed version/);
			await assert.rejects(load.context.storage.getSnapshot(), /another seed version/);
			fetched = seed;
			await assert.rejects(
				load.context.storage.getSnapshotTree({ id: "other-version", treeId: seed.id ?? "" }),
				/another seed version/,
			);
			await assert.rejects(
				load.context.storage.getSnapshot({ versionId: "other-version" }),
				/another seed version/,
			);
			fetched = {
				id: "native-summary",
				blobs: { ".metadata": "stored-native-metadata" },
				trees: {},
			};
			assert.equal(await load.context.storage.getSnapshotTree(), fetched);
			const fetchedSnapshot = await load.context.storage.getSnapshot();
			assert.equal(fetchedSnapshot.snapshotTree, fetched);
			await assert.rejects(
				load.context.storage.getSnapshot({ loadingGroupIds: ["group"] }),
				/Loading groups/,
			);
			return new ConstructionRuntime();
		});
		await factory.instantiateRuntime(context, true);
	});

	it("rejects incomplete materialization before native runtime loading", async () => {
		const factory = seedRuntimeFactory(
			makeProjector({ materialize: () => ({ snapshot: native.snapshot, blobs: new Map() }) }),
			async () => assert.fail("Must not load incomplete state"),
		);
		await assert.rejects(
			factory.instantiateRuntime(makeContext(), true),
			/missing a referenced blob/,
		);
	});

	it("rejects local blob IDs colliding with protocol, application, or cached service blobs", async () => {
		for (const location of ["protocol", "application", "contents"] as const) {
			const source: ISnapshotTree = {
				...seed,
				trees: {
					...seed.trees,
					[location === "protocol" ? ".protocol" : "applicationProjection"]: {
						blobs: { content: location === "contents" ? "input" : "0" },
						trees: {},
					},
				},
			};
			const snapshotWithContents = asSnapshot(source);
			const cachedId = location === "contents" ? "0" : "untouched";
			snapshotWithContents.blobContents.set(cachedId, stringToBuffer("stored body", "utf8"));
			const context = makeContext({ baseSnapshot: source, snapshotWithContents });
			const factory = seedRuntimeFactory(
				makeProjector({
					materialize: () => ({
						snapshot: { blobs: { ".metadata": "0" }, trees: {} },
						blobs: new Map([["0", stringToBuffer("native body", "utf8")]]),
					}),
				}),
				async () => assert.fail("Colliding namespaces must not reach the runtime"),
			);
			await assert.rejects(factory.instantiateRuntime(context, true), /blob IDs collide/);
			assert.equal(
				bufferToString(
					snapshotWithContents.blobContents.get(cachedId) ?? new ArrayBuffer(0),
					"utf8",
				),
				"stored body",
			);
		}
	});

	it("rejects blob namespace collisions introduced by snapshot refetches", async () => {
		for (const location of ["tree", "contents"] as const) {
			const original = makeContext();
			const fetched = asSnapshot(
				location === "tree" ? { blobs: { ".metadata": "metadata" }, trees: {} } : seed,
			);
			if (location === "contents") {
				fetched.blobContents.set("content", stringToBuffer("service blob", "utf8"));
			}
			const context = makeContext({
				storage: {
					...original.storage,
					getSnapshotTree: async () => fetched.snapshotTree,
					getSnapshot: async () => fetched,
				},
			});
			const factory = seedRuntimeFactory(makeProjector(), async (load) => {
				assert(load.context.storage.getSnapshot !== undefined);
				await assert.rejects(load.context.storage.getSnapshot(), /blob IDs collide/);
				if (location === "tree") {
					await assert.rejects(load.context.storage.getSnapshotTree(), /blob IDs collide/);
				}
				return new ConstructionRuntime();
			});
			await factory.instantiateRuntime(context, true);
		}
	});

	it("disables loader tracking only for seeds, regardless of interactive offline settings", async () => {
		for (const interactive of [true, false]) {
			for (const enabled of [undefined, false, true]) {
				let disabled = false;
				const context = makeContext({
					clientDetails: { capabilities: { interactive } },
					disableOfflineLoad: () => {
						disabled = true;
					},
					taggedLogger: mixinMonitoringContext(new MockLogger(), {
						getRawConfig: (name) =>
							name === "Fluid.Container.enableOfflineFull"
								? enabled
								: name === "Fluid.Summarizer.immediatelyRefreshLatestSummaryAck"
									? false
									: undefined,
					}).logger,
				});
				const factory = seedRuntimeFactory(
					makeProjector({
						readSeed: async () => {
							assert(disabled, "Disable loader tracking before asynchronous materialization");
							return "seed";
						},
					}),
					async () => new ConstructionRuntime(),
				);
				await factory.instantiateRuntime(context, true);
				assert(disabled);
				disabled = false;
				await factory.instantiateRuntime({ ...context, baseSnapshot: native.snapshot }, true);
				assert(!disabled, "Native loads must preserve host offline settings");
			}
		}
	});

	it("fails safely with older loaders that cannot disable interactive offline tracking", async () => {
		for (const interactive of [true, false]) {
			for (const enabled of [undefined, false, true]) {
				const context = makeContext({
					disableOfflineLoad: undefined,
					clientDetails: { capabilities: { interactive } },
					taggedLogger: mixinMonitoringContext(new MockLogger(), {
						getRawConfig: (name) =>
							name === "Fluid.Container.enableOfflineFull" ? enabled : undefined,
					}).logger,
				});
				let seedRead = false;
				const runtime = new ConstructionRuntime();
				const factory = seedRuntimeFactory(
					makeProjector({
						readSeed: async () => {
							seedRead = true;
							return "seed";
						},
					}),
					async () => runtime,
				);
				if (interactive && (enabled ?? true)) {
					await assert.rejects(
						factory.instantiateRuntime(context, true),
						/loader that can disable offline snapshot tracking/,
					);
					assert.equal(seedRead, false);
				} else {
					await factory.instantiateRuntime(context, true);
					assert.equal(seedRead, true);
				}
				const nativeContext = { ...context, baseSnapshot: native.snapshot };
				assert.equal(await factory.instantiateRuntime(nativeContext, true), runtime);
			}
		}
	});

	for (const fromSeed of [true, false]) {
		it(`loads through the real loader with default host settings, fromSeed=${fromSeed}`, async () => {
			const codeDetails = { package: "seed-application" };
			const stored = getISnapshotFromSerializedContainer(
				createSeedSummary({
					codeDetails,
					applicationProjection: {
						type: SummaryType.Tree,
						tree: {
							[fromSeed ? "input" : ".metadata"]: {
								type: SummaryType.Blob,
								content: fromSeed ? "seed" : "native",
							},
						},
					},
				}),
			);
			stored.snapshotTree.id = "stored-version";
			const resolvedUrl: IResolvedUrl = {
				type: "fluid",
				id: "document",
				url: "https://example.com/tenant/document",
				tokens: {},
				endpoints: {},
			};
			const storage: IDocumentStorageService = {
				...makeContext().storage,
				getVersions: async () => [{ id: "stored-version", treeId: "stored-version" }],
				getSnapshotTree: async () => stored.snapshotTree,
				downloadSummary: async () => assert.fail("No summary download expected"),
				readBlob: async (id) => {
					const blob = stored.blobContents.get(id);
					assert(blob !== undefined);
					return blob;
				},
			};
			const service: IDocumentService = Object.assign(
				new TypedEventEmitter<IDocumentServiceEvents>(),
				{
					resolvedUrl,
					connectToStorage: async () => storage,
					connectToDeltaStorage: async () => assert.fail("No operation fetch expected"),
					connectToDeltaStream: async () => assert.fail("No connection expected"),
					dispose: () => {},
				},
			);
			const runtime = new ConstructionRuntime();
			const factory = seedRuntimeFactory(makeProjector(), async (load) => {
				assert.equal(load.fromSeed, fromSeed);
				return runtime;
			});
			const container = await loadExistingContainer({
				codeLoader: {
					load: async () => ({ module: { fluidExport: factory }, details: codeDetails }),
				},
				urlResolver: {
					resolve: async () => resolvedUrl,
					getAbsoluteUrl: async () => resolvedUrl.url,
				},
				documentServiceFactory: {
					createContainer: async () => assert.fail("No creation expected"),
					createDocumentService: async () => service,
				},
				request: {
					url: resolvedUrl.url,
					headers: { [LoaderHeader.loadMode]: { deltaConnection: "none" } },
				},
			});
			try {
				assert.equal(container.closed, false);
				assert.equal(await container.getEntryPoint(), await runtime.getEntryPoint());
				assert(container.getPendingLocalState !== undefined);
				if (fromSeed) {
					await assert.rejects(container.getPendingLocalState(), /offline load is enabled/);
				} else {
					const captured = await container.getPendingLocalState();
					assert(captured.includes('"pendingRuntimeState":"pending"'));
				}
				assert.equal(
					container.closed,
					false,
					"A rejected capture must not close the container",
				);
			} finally {
				container.dispose();
			}
		});
	}

	it("rejects unsupported seed modes before reading application input", async () => {
		const rejectRead = async (): Promise<never> => assert.fail("No seed reads");
		const contexts = [
			makeContext({ pendingLocalState: {} }),
			makeContext({ attachState: AttachState.Detached }),
			makeContext({ getLoadedFromVersion: () => undefined }),
			makeContext({ baseSnapshot: { ...seed, groupId: "group" } }),
		];
		for (const context of contexts) {
			const factory = seedRuntimeFactory(makeProjector({ readSeed: rejectRead }), async () =>
				assert.fail("No native runtime loading"),
			);
			await assert.rejects(factory.instantiateRuntime(context, true));
		}
		const nativeOnly = seedRuntimeFactory(
			makeProjector({ readSeed: rejectRead }),
			async () => assert.fail("No native runtime loading"),
			{ allowProjection: false },
		);
		await assert.rejects(nativeOnly.instantiateRuntime(makeContext(), true), /Native-only/);
	});

	it("serializes the real temporary runtime, preserves binary contents, and disposes it", async () => {
		const outputs: SeedRuntimeConstructionResult[] = [];
		for (let index = 0; index < 2; index++) {
			const runtime = new ConstructionRuntime();
			outputs.push(
				await createSeedRuntimeSnapshot({
					runtimeFactory: makeRuntimeFactory(runtime),
					initialize: async (container) => {
						assert.equal(container.attachState, AttachState.Detached);
						runtime.summary.tree.initialized = { type: SummaryType.Blob, content: "ready" };
						assert.equal(await container.getEntryPoint(), await runtime.getEntryPoint());
					},
				}),
			);
			assert(runtime.disposed);
			assert.equal(runtime.disposeCount, 1);
		}
		assert.deepEqual(outputs[0], outputs[1]);
		const binary = outputs[0].blobs.get(outputs[0].snapshot.blobs.binary);
		assert(binary !== undefined);
		assert.deepEqual(new Uint8Array(binary), new Uint8Array([0, 128, 255]));
		// The returned summary is the same object captured from `runtime.createSummary()`.
		assert.deepEqual(Object.keys(outputs[0].summary.tree).sort(), ["binary", "initialized"]);
	});

	it("composes the captured summary with createSeedSummary without double-wrapping .app", async () => {
		const runtime = new ConstructionRuntime();
		const captured = await createSeedRuntimeSnapshot({
			runtimeFactory: makeRuntimeFactory(runtime),
		});
		const creationSummary = createSeedSummary({
			codeDetails: { package: "application" },
			applicationProjection: captured.summary,
		});
		assert.deepEqual(Object.keys(creationSummary.tree).sort(), [".app", ".protocol"]);
		assert.equal(creationSummary.tree[".app"], captured.summary);
		const converted = getISnapshotFromSerializedContainer(creationSummary);
		// The blobs reachable from the converted snapshot must match the returned snapshot/blob
		// map by path, including non-UTF-8 bytes, confirming both representations were derived from
		// the same underlying summary rather than reconstructed independently. Application content
		// is flattened into the root snapshot tree alongside `.protocol`, not nested under `.app`.
		const binaryBlobId = converted.snapshotTree.blobs.binary;
		assert(binaryBlobId !== undefined);
		const convertedBinary = converted.blobContents.get(binaryBlobId);
		assert(convertedBinary !== undefined);
		const capturedBinary = captured.blobs.get(captured.snapshot.blobs.binary);
		assert(capturedBinary !== undefined);
		assert.deepEqual(new Uint8Array(convertedBinary), new Uint8Array(capturedBinary));
		assert.deepEqual(new Uint8Array(convertedBinary), new Uint8Array([0, 128, 255]));
	});

	it("disposes temporary state when initialization or summary serialization fails", async () => {
		for (const failure of ["initialize", "summary"] as const) {
			const runtime = new ConstructionRuntime();
			if (failure === "summary") {
				runtime.summary.tree.bad = {
					type: SummaryType.Handle,
					handle: "/not-uploaded",
					handleType: SummaryType.Tree,
				};
			}
			await assert.rejects(
				createSeedRuntimeSnapshot({
					runtimeFactory: makeRuntimeFactory(runtime),
					initialize: async () => {
						if (failure === "initialize") {
							throw new Error("Initialization failed");
						}
					},
				}),
			);
			assert(runtime.disposed);
		}
	});

	it("cannot attach a temporary construction container", async () => {
		const runtime = new ConstructionRuntime();
		await assert.rejects(
			createSeedRuntimeSnapshot({
				runtimeFactory: makeRuntimeFactory(runtime),
				initialize: async (container) => container.attach({ url: "unexpected" }),
			}),
			/cannot access a document service/,
		);
		assert(runtime.disposed);
	});

	it("disposes the temporary container when runtime construction fails", async () => {
		const logger = new MockLogger();
		const runtimeFactory: IRuntimeFactory = {
			get IRuntimeFactory() {
				return this;
			},
			instantiateRuntime: async () => {
				throw new Error("Construction failed");
			},
		};
		await assert.rejects(
			createSeedRuntimeSnapshot({ runtimeFactory, logger }),
			/Construction failed/,
		);
		assert(
			logger.events.some(
				(event) =>
					typeof event.eventName === "string" && event.eventName.endsWith("ContainerDispose"),
			),
			"Failed creation must dispose the container that the caller cannot access",
		);
	});

	it("disposes a captured runtime when its factory disposes the context before ownership", async () => {
		const runtime = new ConstructionRuntime();
		await assert.rejects(
			createSeedRuntimeSnapshot({
				runtimeFactory: {
					get IRuntimeFactory() {
						return this;
					},
					instantiateRuntime: async (context) => {
						assert(context.disposeFn !== undefined);
						context.disposeFn();
						return runtime;
					},
				},
			}),
		);
		assert.equal(runtime.disposed, true);
		assert.equal(runtime.disposeCount, 1);
	});
});

describe("assertDeterministicSeedConstruction", () => {
	const makeSnapshot = (): SeedRuntimeSnapshot => ({
		snapshot: {
			blobs: { ".metadata": "metadata-id", "shared.blob": "shared-id" },
			trees: {
				".channels": {
					blobs: { header: "header-id" },
					trees: {},
					unreferenced: true,
				},
			},
		},
		blobs: new Map([
			["metadata-id", stringToBuffer("metadata-contents", "utf8")],
			["shared-id", stringToBuffer("shared-contents", "utf8")],
			["header-id", stringToBuffer("header-contents", "utf8")],
		]),
	});

	const withBlob = (
		snapshot: SeedRuntimeSnapshot,
		id: string,
		contents: string,
	): SeedRuntimeSnapshot => ({
		snapshot: snapshot.snapshot,
		blobs: new Map(snapshot.blobs).set(id, stringToBuffer(contents, "utf8")),
	});

	it("does not throw for identical snapshots", () => {
		assertDeterministicSeedConstruction(makeSnapshot(), makeSnapshot());
	});

	it("throws when blob contents differ", () => {
		const first = makeSnapshot();
		const second = withBlob(makeSnapshot(), "shared-id", "different-contents");
		assert.throws(
			() => assertDeterministicSeedConstruction(first, second),
			/shared\.blob.*blob (contents differ|length differs)/,
		);
	});

	it("throws when blob names differ", () => {
		const first = makeSnapshot();
		const second = makeSnapshot();
		const mutableBlobs = second.snapshot.blobs as Record<string, string>;
		delete mutableBlobs["shared.blob"];
		mutableBlobs["other.blob"] = "shared-id";
		assert.throws(
			() => assertDeterministicSeedConstruction(first, second),
			/blob names differ/,
		);
	});

	it("throws when subtree names differ", () => {
		const first = makeSnapshot();
		const second = makeSnapshot();
		const mutableTrees = second.snapshot.trees as Record<string, ISnapshotTree>;
		delete mutableTrees[".channels"];
		mutableTrees[".other"] = { blobs: {}, trees: {} };
		assert.throws(
			() => assertDeterministicSeedConstruction(first, second),
			/subtree names differ/,
		);
	});

	it("throws when the unreferenced flag differs", () => {
		const first = makeSnapshot();
		const second = makeSnapshot();
		(second.snapshot.trees[".channels"] as { unreferenced?: boolean }).unreferenced = false;
		assert.throws(
			() => assertDeterministicSeedConstruction(first, second),
			/unreferenced flag differs/,
		);
	});

	it("skips excluded blob names even when their contents differ", () => {
		const first = makeSnapshot();
		const second = withBlob(makeSnapshot(), "metadata-id", "different-metadata");
		assertDeterministicSeedConstruction(first, second, {
			excludeBlobNames: [".metadata"],
		});
	});
});
