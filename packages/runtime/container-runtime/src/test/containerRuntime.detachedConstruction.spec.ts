/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "node:assert";

import { AttachState } from "@fluidframework/container-definitions";
import {
	ConnectionState,
	type IContainerContext,
	type IContainerStorageService,
} from "@fluidframework/container-definitions/internal";
import type { ConfigTypes } from "@fluidframework/core-interfaces";
import { FluidDataStoreRuntime } from "@fluidframework/datastore/internal";
import { SummaryType, type ISummaryTree } from "@fluidframework/driver-definitions";
import type { ISnapshotTree } from "@fluidframework/driver-definitions/internal";
import type {
	IFluidDataStoreFactory,
	NamedFluidDataStoreRegistryEntries,
} from "@fluidframework/runtime-definitions/internal";
import { toFluidHandleInternal } from "@fluidframework/runtime-utils/internal";
import { MockLogger, mixinMonitoringContext } from "@fluidframework/telemetry-utils/internal";
import {
	MockAudience,
	MockDeltaManager,
	MockQuorumClients,
} from "@fluidframework/test-runtime-utils/internal";
import Sinon from "sinon";

import {
	ContainerRuntime,
	loadContainerRuntime,
	type IContainerRuntimeOptions,
} from "../containerRuntime.js";
import { FluidDataStoreRegistry } from "../dataStoreRegistry.js";
import type { IDetachedRuntimeConstructionOptions } from "../detachedRuntimeConstruction.js";
import {
	metadataBlobName,
	type IContainerRuntimeMetadata,
	type ISummaryGenerationOptions,
} from "../summary/index.js";

const constructionSessionId = "aaaaaaaa-aaaa-4aaa-aaaa-aaaaaaaaaaaa";
const otherSessionId = "bbbbbbbb-bbbb-4bbb-bbbb-bbbbbbbbbbbb";

const dataStoreFactory: IFluidDataStoreFactory = {
	type: "construction-test",
	get IFluidDataStoreFactory() {
		return this;
	},
	async instantiateDataStore(context, existing) {
		return new FluidDataStoreRuntime(context, new Map(), existing, async () => ({}));
	},
};

/**
 * Supplies the native summary to runtime loading without authoring any runtime metadata.
 */
function snapshotFromSummary(summary: ISummaryTree) {
	const blobs = new Map<string, ArrayBufferLike>();
	function convert(tree: ISummaryTree, path: string): ISnapshotTree {
		const snapshot: ISnapshotTree = { blobs: {}, trees: {} };
		for (const [key, value] of Object.entries(tree.tree)) {
			const childPath = `${path}/${key}`;
			if (value.type === SummaryType.Tree) {
				snapshot.trees[key] = convert(value, childPath);
			} else {
				assert(value.type === SummaryType.Blob);
				snapshot.blobs[key] = childPath;
				blobs.set(
					childPath,
					typeof value.content === "string"
						? new TextEncoder().encode(value.content).buffer
						: Uint8Array.from(value.content).buffer,
				);
			}
		}
		return snapshot;
	}
	const baseSnapshot = convert(summary, "");
	const storage: Partial<IContainerStorageService> = {
		readBlob: async (id) => {
			const blob = blobs.get(id);
			assert(blob !== undefined, `Missing native blob ${id}`);
			return blob;
		},
	};
	return { baseSnapshot, storage: storage as IContainerStorageService };
}

function metadataFromSummary(summary: ISummaryTree): IContainerRuntimeMetadata {
	const blob: ISummaryTree["tree"][string] | undefined = summary.tree[metadataBlobName];
	assert(blob?.type === SummaryType.Blob && typeof blob.content === "string");
	return JSON.parse(blob.content) as IContainerRuntimeMetadata;
}

describe("Detached runtime construction", () => {
	let runtimes: ContainerRuntime[];

	beforeEach(() => {
		runtimes = [];
	});

	afterEach(() => {
		for (const runtime of runtimes) runtime.dispose();
	});

	async function createRuntime({
		constructionOptions = { idCompressorSessionId: constructionSessionId },
		ordinary = false,
		existing = false,
		contextOverrides = {},
		runtimeOptions = { enableRuntimeIdCompressor: "on" },
		settings = {},
		containerRuntimeCtor,
		summaryGenerationOptions,
	}: {
		constructionOptions?: IDetachedRuntimeConstructionOptions;
		ordinary?: boolean;
		existing?: boolean;
		contextOverrides?: Partial<IContainerContext>;
		runtimeOptions?: IContainerRuntimeOptions;
		settings?: Record<string, ConfigTypes>;
		containerRuntimeCtor?: typeof ContainerRuntime;
		summaryGenerationOptions?: ISummaryGenerationOptions;
	} = {}) {
		const close = Sinon.spy();
		const storage: Partial<IContainerStorageService> = {};
		const context = {
			attachState: AttachState.Detached,
			connected: false,
			deltaManager: new MockDeltaManager(),
			audience: new MockAudience(),
			quorum: new MockQuorumClients(),
			taggedLogger: mixinMonitoringContext(new MockLogger(), {
				getRawConfig: (name) => settings[name],
			}).logger,
			clientDetails: { capabilities: { interactive: true } },
			closeFn: close,
			updateDirtyContainerState: () => {},
			getLoadedFromVersion: () => undefined,
			options: {},
			storage: storage as IContainerStorageService,
			...contextOverrides,
		} satisfies Partial<IContainerContext>;
		const params = {
			context: context as IContainerContext,
			existing,
			provideEntryPoint: async () => ({}),
			runtimeOptions,
			detachedConstructionOptions: ordinary ? undefined : constructionOptions,
			summaryGenerationOptions,
		};
		const registryEntries: NamedFluidDataStoreRegistryEntries = [
			[dataStoreFactory.type, dataStoreFactory],
		];
		let runtime: Awaited<ReturnType<typeof loadContainerRuntime>>;
		if (containerRuntimeCtor === undefined) {
			runtime = await loadContainerRuntime({ ...params, registryEntries });
		} else {
			const loaded = await ContainerRuntime.loadRuntime2({
				...params,
				registry: new FluidDataStoreRegistry(registryEntries),
				containerRuntimeCtor,
			});
			runtime = loaded.runtime;
		}
		assert(runtime instanceof ContainerRuntime);
		runtimes.push(runtime);
		return { runtime, close };
	}

	async function initializeStores(runtime: ContainerRuntime) {
		const first = await runtime.createDataStore(dataStoreFactory.type);
		assert.equal(await first.trySetAlias("first"), "Success");
		const detached = runtime.createDetachedDataStore([dataStoreFactory.type]);
		const second = await detached.attachRuntime(
			dataStoreFactory,
			await dataStoreFactory.instantiateDataStore(detached, false),
		);
		assert.equal(await second.trySetAlias("second"), "Success");
		return [first.entryPoint.absolutePath, second.entryPoint.absolutePath];
	}

	it("constructs identical collaborative state while preserving native telemetry metadata", async () => {
		const now = Sinon.stub(Date, "now").returns(1000);
		try {
			async function construct() {
				const { runtime } = await createRuntime();
				const paths = await initializeStores(runtime);
				assert.equal(runtime.idCompressor?.localSessionId, constructionSessionId);
				runtime.idCompressor?.generateCompressedId();
				runtime.idCompressor?.generateCompressedId();
				return { runtime, paths, summary: runtime.createSummary() };
			}
			const first = await construct();
			now.returns(2000);
			const second = await construct();
			assert.deepEqual(first.paths, second.paths);
			assert.notEqual(first.paths[0], first.paths[1]);
			assert.deepEqual(
				{ ...first.summary.tree, [metadataBlobName]: undefined },
				{ ...second.summary.tree, [metadataBlobName]: undefined },
			);
			const firstMetadata = metadataFromSummary(first.summary);
			const secondMetadata = metadataFromSummary(second.summary);
			assert.equal(firstMetadata.createContainerTimestamp, 1000);
			assert.equal(secondMetadata.createContainerTimestamp, 2000);
			assert.equal(typeof firstMetadata.telemetryDocumentId, "string");
			assert.equal(typeof secondMetadata.telemetryDocumentId, "string");
			assert.notEqual(firstMetadata.telemetryDocumentId, secondMetadata.telemetryDocumentId);
			assert.deepEqual(
				{
					...firstMetadata,
					createContainerTimestamp: undefined,
					telemetryDocumentId: undefined,
				},
				{
					...secondMetadata,
					createContainerTimestamp: undefined,
					telemetryDocumentId: undefined,
				},
			);
			assert.equal(first.runtime.idCompressor?.takeNextCreationRange().ids, undefined);
		} finally {
			now.restore();
		}
	});

	it("loads native construction output with independent fresh live sessions", async () => {
		const { runtime } = await createRuntime();
		const paths = await initializeStores(runtime);
		const compressor = runtime.idCompressor;
		assert(compressor !== undefined);
		const id = compressor.generateCompressedId();
		const stableId = compressor.decompress(id);
		const contextOverrides = {
			...snapshotFromSummary(runtime.createSummary()),
			attachState: AttachState.Attached,
		};
		const first = await createRuntime({ ordinary: true, existing: true, contextOverrides });
		const second = await createRuntime({ ordinary: true, existing: true, contextOverrides });
		assert.notEqual(first.runtime.idCompressor?.localSessionId, constructionSessionId);
		assert.notEqual(
			first.runtime.idCompressor?.localSessionId,
			second.runtime.idCompressor?.localSessionId,
		);
		assert.equal(
			typeof metadataFromSummary(first.runtime.createSummary()).telemetryDocumentId,
			"string",
		);
		for (const live of [first, second]) {
			const liveCompressor = live.runtime.idCompressor;
			assert(liveCompressor !== undefined);
			assert.equal(liveCompressor.decompress(liveCompressor.recompress(stableId)), stableId);
			const firstEntryPoint = await live.runtime.getAliasedDataStoreEntryPoint("first");
			const secondEntryPoint = await live.runtime.getAliasedDataStoreEntryPoint("second");
			assert(firstEntryPoint !== undefined);
			assert(secondEntryPoint !== undefined);
			assert.deepEqual(
				[
					toFluidHandleInternal(firstEntryPoint).absolutePath,
					toFluidHandleInternal(secondEntryPoint).absolutePath,
				],
				paths,
			);
			assert.notEqual(
				liveCompressor.decompress(liveCompressor.generateCompressedId()),
				stableId,
			);
			assert.doesNotThrow(() => live.runtime.getPendingLocalState());
		}
	});

	it("copies construction options before asynchronous loading", async () => {
		const constructionOptions = { idCompressorSessionId: constructionSessionId };
		const pending = createRuntime({ constructionOptions });
		constructionOptions.idCompressorSessionId = otherSessionId;
		const { runtime } = await pending;
		assert.equal(runtime.idCompressor?.localSessionId, constructionSessionId);
	});

	it("supports both factory options with the original derived-runtime constructor arguments", async () => {
		class DerivedRuntime extends ContainerRuntime {}
		// Model a subclass forwarding only the constructor arguments supported before these factory options.
		const containerRuntimeCtor = new Proxy(DerivedRuntime, {
			construct: (target, args) => {
				const instance: unknown = Reflect.construct(target, args.slice(0, 20));
				assert(instance instanceof DerivedRuntime);
				return instance;
			},
		});
		const { runtime, close } = await createRuntime({
			containerRuntimeCtor,
			summaryGenerationOptions: { fullTreePolicy: "untilFirstAck" },
		});
		assert(runtime instanceof DerivedRuntime);
		assert.equal(runtime.idCompressor?.localSessionId, constructionSessionId);
		assert.equal(runtime.shouldSummarizeOnStartup, true);
		assert.throws(
			() => runtime.setAttachState(AttachState.Attaching),
			/detached construction/,
		);
		assert.equal(close.callCount, 1);
	});

	it("requests a writer connection for automatic first-summary election", async () => {
		const requestWriteConnection = Sinon.spy();
		await createRuntime({
			ordinary: true,
			existing: true,
			contextOverrides: { attachState: AttachState.Attached, requestWriteConnection },
			summaryGenerationOptions: { fullTreePolicy: "untilFirstAck" },
		});
		assert.equal(requestWriteConnection.callCount, 1);
	});

	it("leaves an unconfigured native reload out of writer-connection requests", async () => {
		const { runtime } = await createRuntime();
		await initializeStores(runtime);
		const requestWriteConnection = Sinon.spy();
		const { runtime: reloaded } = await createRuntime({
			ordinary: true,
			existing: true,
			contextOverrides: {
				...snapshotFromSummary(runtime.createSummary()),
				attachState: AttachState.Attached,
				requestWriteConnection,
			},
		});
		assert.equal(requestWriteConnection.callCount, 0);
		assert.equal(reloaded.shouldSummarizeOnStartup, false);
	});

	it("supports older loaders without a writer-connection request capability", async () => {
		const { runtime } = await createRuntime({
			ordinary: true,
			existing: true,
			contextOverrides: { attachState: AttachState.Attached },
			summaryGenerationOptions: { fullTreePolicy: "untilFirstAck" },
		});
		assert.equal(runtime.shouldSummarizeOnStartup, true);
	});

	const ordinaryPolicies: ISummaryGenerationOptions["fullTreePolicy"][] = [
		undefined,
		"default",
		"always",
	];
	for (const fullTreePolicy of ordinaryPolicies) {
		it(`does not request a writer connection for policy ${fullTreePolicy}`, async () => {
			const requestWriteConnection = Sinon.spy();
			await createRuntime({
				ordinary: true,
				existing: true,
				contextOverrides: { attachState: AttachState.Attached, requestWriteConnection },
				summaryGenerationOptions: { fullTreePolicy },
			});
			assert.equal(requestWriteConnection.callCount, 0);
		});
	}

	it("does not request a writer connection during detached construction", async () => {
		const requestWriteConnection = Sinon.spy();
		await createRuntime({
			contextOverrides: { requestWriteConnection },
			summaryGenerationOptions: { fullTreePolicy: "untilFirstAck" },
		});
		assert.equal(requestWriteConnection.callCount, 0);
	});

	it("does not request a writer connection on a noninteractive client", async () => {
		const requestWriteConnection = Sinon.spy();
		await createRuntime({
			ordinary: true,
			existing: true,
			contextOverrides: {
				attachState: AttachState.Attached,
				clientDetails: { capabilities: { interactive: false } },
				requestWriteConnection,
			},
			summaryGenerationOptions: { fullTreePolicy: "untilFirstAck" },
		});
		assert.equal(requestWriteConnection.callCount, 0);
	});

	for (const state of ["disabled", "disableHeuristics", "summaryOnRequest"] as const) {
		it(`preserves ${state} scheduling without requesting a writer connection`, async () => {
			const requestWriteConnection = Sinon.spy();
			await createRuntime({
				ordinary: true,
				existing: true,
				contextOverrides: { attachState: AttachState.Attached, requestWriteConnection },
				summaryGenerationOptions: { fullTreePolicy: "untilFirstAck" },
				runtimeOptions: {
					enableRuntimeIdCompressor: "on",
					summaryOptions: {
						summaryConfigOverrides: {
							state,
							initialSummarizerDelayMs: 0,
							maxAckWaitTime: 20_000,
							maxOpsSinceLastSummary: 7000,
						},
					},
				},
			});
			assert.equal(requestWriteConnection.callCount, 0);
		});
	}

	it("leaves ordinary detached runtime sessions and pending-state export unchanged", async () => {
		const before = Date.now();
		const first = await createRuntime({ ordinary: true });
		const second = await createRuntime({ ordinary: true });
		const firstMetadata = metadataFromSummary(first.runtime.createSummary());
		const secondMetadata = metadataFromSummary(second.runtime.createSummary());
		assert(firstMetadata.createContainerTimestamp !== undefined);
		assert(firstMetadata.createContainerTimestamp >= before);
		assert(firstMetadata.createContainerTimestamp <= Date.now());
		assert.equal(typeof firstMetadata.telemetryDocumentId, "string");
		assert.notEqual(firstMetadata.telemetryDocumentId, secondMetadata.telemetryDocumentId);
		assert.notEqual(
			first.runtime.idCompressor?.localSessionId,
			second.runtime.idCompressor?.localSessionId,
		);
		assert.doesNotThrow(() => first.runtime.getPendingLocalState());
		assert.equal(first.close.callCount, 0);
	});

	const invalidContexts: [string, Partial<IContainerContext>][] = [
		["attaching", { attachState: AttachState.Attaching }],
		["attached", { attachState: AttachState.Attached }],
		["connected", { connected: true }],
		["catching up", { getConnectionState: () => ConnectionState.CatchingUp }],
		["snapshot", { baseSnapshot: { blobs: {}, trees: {} } }],
		[
			"snapshot with contents",
			{
				snapshotWithContents: {
					snapshotTree: { blobs: {}, trees: {} },
					blobContents: new Map(),
					ops: [],
					sequenceNumber: 0,
					latestSequenceNumber: 0,
					snapshotFormatV: 1,
				},
			},
		],
		["pending local state", { pendingLocalState: {} }],
	];
	for (const [name, contextOverrides] of invalidContexts) {
		it(`rejects a construction context with ${name}`, async () => {
			await assert.rejects(createRuntime({ contextOverrides }), /requires a new disconnected/);
		});
	}

	it("rejects existing loads even if their context is detached", async () => {
		await assert.rejects(createRuntime({ existing: true }), /requires a new disconnected/);
	});

	for (const idCompressorSessionId of [
		"",
		"invalid",
		constructionSessionId.toUpperCase(),
		"aaaaaaaa-aaaa-5aaa-aaaa-aaaaaaaaaaaa",
		"aaaaaaaa-aaaa-4aaa-caaa-aaaaaaaaaaaa",
		"gaaaaaaa-aaaa-4aaa-aaaa-aaaaaaaaaaaa",
		constructionSessionId.replaceAll("-", ""),
		`${constructionSessionId} `,
	]) {
		it(`rejects invalid compressor session ID ${JSON.stringify(idCompressorSessionId)}`, async () => {
			await assert.rejects(
				createRuntime({
					constructionOptions: { idCompressorSessionId },
				}),
				/requires a valid compressor session ID/,
			);
		});
	}

	for (const enableRuntimeIdCompressor of [undefined, "delayed"] as const) {
		it(`rejects compressor mode ${enableRuntimeIdCompressor}`, async () => {
			await assert.rejects(
				createRuntime({ runtimeOptions: { enableRuntimeIdCompressor } }),
				/requires ID compressor mode on/,
			);
		});
	}

	it("rejects a feature gate disabling the compressor", async () => {
		await assert.rejects(
			createRuntime({ settings: { "Fluid.ContainerRuntime.IdCompressorEnabled": false } }),
			/requires ID compressor mode on/,
		);
	});

	it("rejects random data-store IDs", async () => {
		await assert.rejects(
			createRuntime({ settings: { "Fluid.Runtime.DisableShortIds": true } }),
			/requires short data store IDs/,
		);
	});

	const prohibitedOperations: [string, (runtime: ContainerRuntime) => void][] = [
		["attach", (runtime) => runtime.setAttachState(AttachState.Attaching)],
		["finish attach", (runtime) => runtime.setAttachState(AttachState.Attached)],
		["connect", (runtime) => runtime.setConnectionState(true, "live-client")],
		["connect readonly", (runtime) => runtime.setConnectionState(false, "live-client")],
		[
			"catch up",
			(runtime) =>
				runtime.setConnectionStatus({
					connectionState: ConnectionState.CatchingUp,
					pendingClientConnectionId: "live-client",
					canSendOps: false,
					readonly: false,
				}),
		],
		[
			"connect readonly with status",
			(runtime) =>
				runtime.setConnectionStatus({
					connectionState: ConnectionState.Connected,
					clientConnectionId: "live-client",
					canSendOps: false,
					readonly: true,
				}),
		],
		["export pending state", (runtime) => runtime.getPendingLocalState()],
	];
	for (const [name, operation] of prohibitedOperations) {
		it(`closes rather than ${name} with a construction session`, async () => {
			const { runtime, close } = await createRuntime();
			assert.throws(() => operation(runtime), /detached construction runtime/);
			assert.equal(close.callCount, 1);
			assert.throws(() => operation(runtime), /detached construction runtime/);
			assert.equal(close.callCount, 1);
		});
	}
});
