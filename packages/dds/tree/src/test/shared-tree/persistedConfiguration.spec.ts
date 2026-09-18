/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "node:assert";

import { bufferToString } from "@fluid-internal/client-utils";
import { LocalServerTestDriver } from "@fluid-private/test-drivers";
import { AttachState } from "@fluidframework/container-definitions";
import { LoaderHeader } from "@fluidframework/container-definitions/internal";
import { Loader } from "@fluidframework/container-loader/internal";
import type {
	ChannelConfigurationChannel,
	ChannelConfigurationFactory,
	IChannelAttributes,
	IChannelFactory,
} from "@fluidframework/datastore-definitions/internal";
import { SummaryType, type ISummaryTree } from "@fluidframework/driver-definitions";
import { MessageType } from "@fluidframework/driver-definitions/internal";
import type { IIdCompressor } from "@fluidframework/id-compressor";
import { FlushMode } from "@fluidframework/runtime-definitions/internal";
import type {
	ChannelConfigurationChange,
	ChannelConfigurationFacet,
} from "@fluidframework/shared-object-base/internal";
import {
	MockDeltaConnection,
	MockFluidDataStoreRuntime,
	MockStorage,
} from "@fluidframework/test-runtime-utils/internal";
import {
	TestContainerRuntimeFactory,
	TestFluidObjectFactory,
	TestFluidObjectInternal,
	TestObjectProvider,
	createSummarizer,
	summarizeNow,
} from "@fluidframework/test-utils/internal";

import { asAlpha } from "../../api.js";
import { FormatValidatorBasic } from "../../external-utilities/index.js";
import type { SharedTreeOptions } from "../../shared-tree/index.js";
import { TreeViewConfiguration } from "../../simple-tree/index.js";
import {
	configuredSharedTree,
	configuredSharedTreeInternal,
	type ISharedTree,
} from "../../treeFactory.js";
import { MockContainerRuntimeFactoryWithOpBunching } from "../mocksForOpBunching.js";
import { StringArray, createTestUndoRedoStacks } from "../utils.js";

type Configuration = Readonly<{ retainHistory?: boolean }>;

const viewConfiguration = new TreeViewConfiguration({ schema: StringArray });
const disabledConfiguration: Configuration = { retainHistory: false };

function factory(
	initialConfiguration?: Configuration,
	options: SharedTreeOptions = {},
): IChannelFactory<ISharedTree> {
	return configuredSharedTree(
		{ jsonValidator: FormatValidatorBasic, ...options },
		initialConfiguration,
	).getFactory() as IChannelFactory<ISharedTree>;
}

function configureRuntime(runtime: MockFluidDataStoreRuntime, creationEnabled = true): void {
	Object.assign(runtime, {
		channelConfigurationCreationEnabled: creationEnabled,
		channelConfigurationEnabled: true,
	});
	Object.defineProperty(runtime.deltaManagerInternal, "maxMessageSize", {
		value: 1024 * 1024,
		configurable: true,
	});
}

function configuration(tree: ISharedTree): ChannelConfigurationFacet<Configuration> {
	const facet = tree.kernel.configuration;
	assert(facet !== undefined, "Expected a configured Tree");
	return facet;
}

function publish(tree: ISharedTree): void {
	const channel = tree as ISharedTree & ChannelConfigurationChannel;
	assert(channel.onChannelConfigurationPublication !== undefined);
	channel.onChannelConfigurationPublication();
}

function revisions(tree: ISharedTree): string[] {
	const result: string[] = [];
	let commit = tree.kernel.checkout.branchHistory.getHead();
	while (commit !== undefined) {
		result.push(commit.revision);
		commit = commit.getParent();
	}
	return result;
}

function headRevision(tree: ISharedTree): string {
	const revision = revisions(tree)[0];
	assert(revision !== undefined);
	return revision;
}

function setup(
	initialConfiguration: Configuration = disabledConfiguration,
	grouped = false,
	options: SharedTreeOptions = {},
) {
	const runtimeFactory = new MockContainerRuntimeFactoryWithOpBunching({
		flushMode: grouped ? FlushMode.TurnBased : FlushMode.Immediate,
		enableGroupedBatching: grouped,
	});
	const clients = Array.from({ length: 2 }, (_, index) => {
		const runtime = new MockFluidDataStoreRuntime({ clientId: `client-${index}` });
		const containerRuntime = runtimeFactory.createContainerRuntime(runtime);
		configureRuntime(runtime);
		const tree = factory(initialConfiguration, options).create(runtime, `tree-${index}`);
		tree.connect({
			deltaConnection: runtime.createDeltaConnection(),
			objectStorage: new MockStorage(),
		});
		publish(tree);
		return {
			tree,
			runtime,
			containerRuntime,
		};
	});
	const synchronize = (): void => {
		for (const client of clients) {
			client.containerRuntime.flush();
		}
		runtimeFactory.processAllMessages();
	};
	const initialView = clients[0].tree.viewWith(viewConfiguration);
	initialView.initialize([]);
	initialView.dispose();
	synchronize();
	const views = clients.map(({ tree }) => asAlpha(tree.viewWith(viewConfiguration)));
	const advanceWindow = (): void => {
		// Each client must acknowledge the preceding edits before they leave the collaboration window.
		for (let round = 0; round < 2; round++) {
			for (const view of views) {
				view.root.insertAtEnd("advance-window");
			}
			synchronize();
		}
	};
	return { clients, views, runtimeFactory, synchronize, advanceWindow };
}

/** Persist the channel attributes in the same location used by the datastore runtime. */
async function summarize(tree: ISharedTree): Promise<ISummaryTree> {
	const { summary } = await tree.summarize(true);
	return {
		...summary,
		tree: {
			...summary.tree,
			".attributes": { type: SummaryType.Blob, content: JSON.stringify(tree.attributes) },
		},
	};
}

async function load(
	summary: ISummaryTree,
	idCompressor: IIdCompressor,
	reader: IChannelFactory<ISharedTree> = factory(),
	attachState = AttachState.Attached,
) {
	const runtime = new MockFluidDataStoreRuntime({ idCompressor, attachState });
	configureRuntime(runtime, false);
	const submitted: { contents: unknown; metadata: unknown }[] = [];
	const delta = new MockDeltaConnection(
		(contents: unknown, metadata) => submitted.push({ contents, metadata }),
		() => {},
	);
	const storage = MockStorage.createFromSummary(summary);
	const attributes = JSON.parse(
		bufferToString(await storage.readBlob(".attributes"), "utf8"),
	) as IChannelAttributes;
	const tree = await reader.load(
		runtime,
		"loaded",
		{ deltaConnection: delta, objectStorage: storage },
		attributes,
	);
	return {
		tree,
		runtime,
		delta,
		submitted,
	};
}

function compressor(runtime: MockFluidDataStoreRuntime): IIdCompressor {
	assert(runtime.idCompressor !== undefined);
	return runtime.idCompressor;
}

function historyBlob(summary: ISummaryTree): Record<string, unknown> {
	const blob = summary.tree.HistoryRetention;
	assert(blob?.type === SummaryType.Blob);
	assert.equal(typeof blob.content, "string");
	return JSON.parse(blob.content as string) as Record<string, unknown>;
}

function operationRevision(contents: unknown): number {
	assert(typeof contents === "object" && contents !== null);
	assert("kind" in contents && contents.kind === "operation");
	assert("revision" in contents && typeof contents.revision === "number");
	return contents.revision;
}

function deliverMessage(
	delta: MockDeltaConnection,
	contents: unknown,
	sequenceNumber: number,
	local = false,
	localOpMetadata?: unknown,
): void {
	delta.processMessages({
		envelope: {
			clientId: "client",
			sequenceNumber,
			referenceSequenceNumber: 0,
			minimumSequenceNumber: 0,
			timestamp: 0,
			type: MessageType.Operation,
		},
		local,
		messagesContent: [{ contents, clientSequenceNumber: 1, localOpMetadata }],
	});
}

function detached(initialConfiguration: Configuration = disabledConfiguration) {
	const runtime = new MockFluidDataStoreRuntime({ attachState: AttachState.Detached });
	configureRuntime(runtime);
	const tree = factory(initialConfiguration).create(runtime, "detached");
	const submitted: unknown[] = [];
	tree.connect({
		deltaConnection: new MockDeltaConnection(
			(contents: unknown) => submitted.push(contents),
			() => {},
		),
		objectStorage: new MockStorage(),
	});
	const view = tree.viewWith(viewConfiguration);
	view.initialize([]);
	return { runtime, tree, view, submitted };
}

describe("SharedTree persisted configuration", () => {
	it("persists configuration-only changes through the real datastore and a reader-only summarizer", async () => {
		const creator = factory({ retainHistory: false });
		const reader = factory(undefined, { retainHistory: false });
		let creationEnabled = true;
		const loadedTrees: ISharedTree[] = [];
		const channelFactory: IChannelFactory<ISharedTree> & ChannelConfigurationFactory = {
			type: creator.type,
			attributes: creator.attributes,
			get channelConfigurationProtocolVersion() {
				return (reader as IChannelFactory<ISharedTree> & ChannelConfigurationFactory)
					.channelConfigurationProtocolVersion;
			},
			create: (runtime, id) => creator.create(runtime, id),
			load: async (runtime, id, services, attributes) => {
				const tree = await reader.load(runtime, id, services, attributes);
				loadedTrees.push(tree);
				return tree;
			},
		};
		const provider = new TestObjectProvider(
			Loader,
			new LocalServerTestDriver(),
			() =>
				new TestContainerRuntimeFactory(
					"configured-tree-test",
					new TestFluidObjectFactory(
						[["tree", channelFactory]],
						"TestFluidObjectFactory",
						TestFluidObjectInternal,
					),
					{
						enableRuntimeIdCompressor: "on",
						explicitSchemaControl: true,
						enableChannelConfiguration: creationEnabled,
						summaryOptions: {
							summaryConfigOverrides: {
								state: "disableHeuristics",
								initialSummarizerDelayMs: 0,
								maxAckWaitTime: 20000,
								maxOpsSinceLastSummary: 7000,
							},
						},
					},
				),
		);
		try {
			const container = await provider.makeTestContainer();
			const dataObject = await container.getEntryPoint();
			assert(dataObject instanceof TestFluidObjectInternal);
			const tree = (await dataObject.getInitialSharedObject("tree")) as ISharedTree;
			const view = tree.viewWith(viewConfiguration);
			view.initialize([]);
			view.root.insertAtEnd("before enable");
			await provider.ensureSynchronized();
			const request = configuration(tree).requestChange({ retainHistory: true });
			await provider.ensureSynchronized();
			await request;
			view.root.insertAtEnd("after enable");
			const retainedEdit = headRevision(tree);
			await provider.ensureSynchronized();
			const expectedState = tree.kernel.getHistoryRetentionState();

			creationEnabled = false;
			const { summarizer } = await createSummarizer(provider, container);
			await summarizeNow(summarizer, "initial configured Tree summary");
			assert(loadedTrees.length > 0, "The real summarizer must load the configured channel");
			for (const summarizedTree of loadedTrees) {
				assert.deepEqual(configuration(summarizedTree).current.values, {
					retainHistory: true,
				});
				assert.deepEqual(summarizedTree.kernel.getHistoryRetentionState(), expectedState);
				assert(revisions(summarizedTree).includes(retainedEdit));
			}
			await provider.ensureSynchronized();
			assert.equal(container.isDirty, false);
			const historyBefore = revisions(tree);
			const configurationOnly = configuration(tree).requestChange({ retainHistory: true });
			assert.equal(
				container.isDirty,
				true,
				"Configuration submission must dirty the container",
			);
			await provider.ensureSynchronized();
			await configurationOnly;
			assert.deepEqual(revisions(tree), historyBefore);
			const { summaryVersion } = await summarizeNow(summarizer, "configuration-only summary");
			const loadedContainer = await provider.loadTestContainer(undefined, {
				[LoaderHeader.version]: summaryVersion,
			});
			const loadedDataObject = await loadedContainer.getEntryPoint();
			assert(loadedDataObject instanceof TestFluidObjectInternal);
			const loaded = (await loadedDataObject.getInitialSharedObject("tree")) as ISharedTree;
			assert.equal(configuration(loaded).current.revision, 2);
			assert.deepEqual(configuration(loaded).current.values, { retainHistory: true });
			assert.deepEqual(loaded.kernel.getHistoryRetentionState(), expectedState);
			assert(revisions(loaded).includes(retainedEdit));
			assert.deepEqual(
				[...loaded.viewWith(viewConfiguration).root],
				["before enable", "after enable"],
			);
		} finally {
			provider.reset();
		}
	});

	it("keeps reader support separate from legacy creation and local retention options", async () => {
		const runtime = new MockFluidDataStoreRuntime({ attachState: AttachState.Detached });
		configureRuntime(runtime);
		const reader = factory(undefined, { retainHistory: true });
		const legacy = reader.create(runtime, "legacy");
		assert.equal(legacy.kernel.configuration, undefined);
		assert.equal(legacy.kernel.getHistoryRetentionState(), undefined);
		const view = legacy.viewWith(viewConfiguration);
		view.initialize([]);
		view.root.insertAtEnd("legacy history");
		const summary = await summarize(legacy);
		assert.equal(summary.tree.HistoryRetention, undefined);
		const loaded = await load(summary, compressor(runtime), factory({ retainHistory: true }));
		assert.equal(loaded.tree.kernel.configuration, undefined);
		assert.equal(loaded.tree.kernel.getHistoryRetentionState(), undefined);
		assert.deepEqual([...loaded.tree.viewWith(viewConfiguration).root], ["legacy history"]);
	});

	for (const initialConfiguration of [{}, { retainHistory: false }, { retainHistory: true }]) {
		it(`persists ${JSON.stringify(initialConfiguration)} instead of conflicting reader defaults`, async () => {
			const { clients, views, synchronize, advanceWindow } = setup(initialConfiguration);
			for (let i = 0; i < 8; i++) {
				views[0].root.insertAtEnd(`edit-${i}`);
			}
			synchronize();
			advanceWindow();
			const source = clients[0];
			const summary = await summarize(source.tree);
			const expectedState = source.tree.kernel.getHistoryRetentionState();
			assert.equal(historyBlob(summary).version, 1);
			for (const reader of [
				factory(undefined, { retainHistory: !initialConfiguration.retainHistory }),
				factory(
					{ retainHistory: !initialConfiguration.retainHistory },
					{ retainHistory: !initialConfiguration.retainHistory },
				),
				configuredSharedTreeInternal(
					{ jsonValidator: FormatValidatorBasic, retainHistory: true },
					{ retainHistory: true },
				).getFactory() as IChannelFactory<ISharedTree>,
			]) {
				const loaded = await load(summary, compressor(source.runtime), reader);
				assert.deepEqual(configuration(loaded.tree).current.values, initialConfiguration);
				assert.deepEqual(loaded.tree.kernel.getHistoryRetentionState(), expectedState);
				assert.deepEqual(revisions(loaded.tree), revisions(source.tree));
				// A reader-only client must preserve the same policy when it becomes the summarizer.
				const resummarized = await summarize(loaded.tree);
				const reloaded = await load(resummarized, compressor(source.runtime));
				assert.deepEqual(configuration(reloaded.tree).current.values, initialConfiguration);
				assert.deepEqual(revisions(reloaded.tree), revisions(source.tree));
			}
		});
	}

	it("starts initially enabled history at the first synthetic sequence", () => {
		const { tree } = detached({ retainHistory: true });
		assert.deepEqual(tree.kernel.getHistoryRetentionState(), {
			version: 1,
			start: {
				revision: 0,
				sequenceNumber: Number.MIN_SAFE_INTEGER + 1,
				indexInBatch: 0,
			},
		});
	});

	it("does not backfill pre-enable history held only by a local fork", async () => {
		const { clients, views, synchronize, advanceWindow } = setup();
		const fork = views[0].fork();
		views[0].root.insertAtEnd("before enable");
		const before = headRevision(clients[0].tree);
		synchronize();
		advanceWindow();
		assert(revisions(clients[0].tree).includes(before));
		assert(!revisions(clients[1].tree).includes(before));
		const request = configuration(clients[0].tree).requestChange({ retainHistory: true });
		synchronize();
		const result = await request;
		assert.equal(result.status, "applied");
		assert.deepEqual(
			clients[0].tree.kernel.getHistoryRetentionState(),
			clients[1].tree.kernel.getHistoryRetentionState(),
		);
		views[0].root.insertAtEnd("after enable");
		const after = headRevision(clients[0].tree);
		synchronize();
		advanceWindow();
		assert(revisions(clients[0].tree).includes(before), "The fork still needs old history");
		for (const client of clients) {
			const loaded = await load(await summarize(client.tree), compressor(client.runtime));
			assert(!revisions(loaded.tree).includes(before), "Fork history is not archival history");
			assert(revisions(loaded.tree).includes(after));
		}
		fork.root.insertAtEnd("fork edit");
		fork.rebaseOnto(views[0]);
		views[0].merge(fork);
		synchronize();
		assert(views[1].root.includes("fork edit"));
	});

	it("retains edits authored before enable but sequenced after the barrier", async () => {
		const { clients, views, synchronize, advanceWindow } = setup({}, true);
		views[1].root.insertAtEnd("authored under revision zero");
		const oldRevisionEdit = headRevision(clients[1].tree);
		const request = configuration(clients[0].tree).requestChange({ retainHistory: true });
		// Flush the barrier first, although the other client's edit was authored first.
		clients[0].containerRuntime.flush();
		clients[1].containerRuntime.flush();
		synchronize();
		const result = await request;
		assert.equal(result.status, "applied");
		advanceWindow();
		for (const client of clients) {
			assert(revisions(client.tree).includes(oldRevisionEdit));
			const loaded = await load(await summarize(client.tree), compressor(client.runtime));
			assert(revisions(loaded.tree).includes(oldRevisionEdit));
			assert(
				loaded.tree.viewWith(viewConfiguration).root.includes("authored under revision zero"),
			);
		}
	});

	it("uses committed Tree batch indexes, not grouped message indexes or optimistic edits", async () => {
		const { clients, views, synchronize, advanceWindow } = setup({}, true);
		const tree = clients[0].tree;
		const noop = configuration(tree).requestChange({});
		synchronize();
		await noop;
		views[0].root.insertAtEnd("before the grouped barrier");
		const before = headRevision(tree);
		// An obsolete proposal occupies a message index, but is neither a Tree commit nor a new revision.
		clients[0].containerRuntime.submit(
			{
				version: 1,
				kind: "configuration",
				expectedRevision: 0,
				values: {},
			},
			undefined,
		);
		const pending = configuration(tree).requestChange({ retainHistory: true });
		views[0].root.insertAtEnd("after the grouped barrier");
		const after = headRevision(tree);
		synchronize();
		const result = await pending;
		assert(result.source === "sequenced");
		assert.deepEqual(tree.kernel.getHistoryRetentionState(), {
			version: 1,
			start: {
				revision: result.current.revision,
				sequenceNumber: result.sequenceNumber,
				indexInBatch: 1,
			},
		});
		advanceWindow();
		for (const client of clients) {
			const loaded = await load(await summarize(client.tree), compressor(client.runtime));
			assert(!revisions(loaded.tree).includes(before));
			assert(revisions(loaded.tree).includes(after));
		}
	});

	it("keeps an identical enabled replacement in the same epoch and reenables in a new epoch", async () => {
		const { clients, views, synchronize, advanceWindow } = setup();
		const tree = clients[0].tree;
		let request = configuration(tree).requestChange({ retainHistory: true });
		synchronize();
		await request;
		const firstStart = tree.kernel.getHistoryRetentionState();
		views[0].root.insertAtEnd("first epoch");
		const firstEpochEdit = headRevision(tree);
		synchronize();
		request = configuration(tree).requestChange({ retainHistory: true });
		synchronize();
		await request;
		assert.equal(configuration(tree).current.revision, 2);
		assert.deepEqual(tree.kernel.getHistoryRetentionState(), firstStart);
		const loaded = await load(await summarize(tree), compressor(clients[0].runtime));
		assert.equal(configuration(loaded.tree).current.revision, 2);
		assert.deepEqual(loaded.tree.kernel.getHistoryRetentionState(), firstStart);
		request = configuration(tree).requestChange({});
		synchronize();
		await request;
		assert.deepEqual(tree.kernel.getHistoryRetentionState(), { version: 1, start: null });
		advanceWindow();
		request = configuration(tree).requestChange({ retainHistory: true });
		synchronize();
		const reenable = await request;
		assert(reenable.source === "sequenced");
		assert.deepEqual(tree.kernel.getHistoryRetentionState(), {
			version: 1,
			start: { revision: 4, sequenceNumber: reenable.sequenceNumber, indexInBatch: 0 },
		});
		views[0].root.insertAtEnd("second epoch");
		const secondEpochEdit = headRevision(tree);
		synchronize();
		advanceWindow();
		const reloaded = await load(await summarize(tree), compressor(clients[0].runtime));
		assert(!revisions(reloaded.tree).includes(firstEpochEdit));
		assert(revisions(reloaded.tree).includes(secondEpochEdit));
	});

	it("does not reset the winning history epoch when a concurrent proposal conflicts", async () => {
		const { clients, synchronize } = setup();
		const first = configuration(clients[0].tree).requestChange({ retainHistory: true });
		const second = configuration(clients[1].tree).requestChange({});
		synchronize();
		const [winner, loser] = await Promise.all([first, second]);
		assert.equal(winner.status, "applied");
		assert.equal(loser.status, "conflict");
		assert.equal(configuration(clients[0].tree).current.revision, 1);
		assert.deepEqual(
			clients[0].tree.kernel.getHistoryRetentionState(),
			clients[1].tree.kernel.getHistoryRetentionState(),
		);
		assert.equal(clients[0].tree.kernel.getHistoryRetentionState()?.start?.revision, 1);
	});

	it("preserves divergent shared branch contents through toggles and summary reload", async () => {
		const { clients, views, synchronize, advanceWindow } = setup({}, false, {
			enableSharedBranches: true,
		});
		const tree = clients[0].tree;
		views[0].root.insertAtEnd("shared base");
		synchronize();
		const branchId = tree.createSharedBranch("retained branch");
		synchronize();
		const branch = tree.viewSharedBranchWith(branchId, viewConfiguration);
		branch.root.insertAtEnd("divergent branch edit");
		synchronize();
		for (const retainHistory of [true, false, true]) {
			const request = configuration(tree).requestChange({ retainHistory });
			synchronize();
			await request;
			advanceWindow();
		}
		const loaded = await load(
			await summarize(tree),
			compressor(clients[0].runtime),
			factory(undefined, { enableSharedBranches: true }),
		);
		assert.deepEqual(
			[...loaded.tree.viewSharedBranchWith(branchId, viewConfiguration).root],
			["shared base", "divergent branch edit"],
		);
		assert(!loaded.tree.viewWith(viewConfiguration).root.includes("divergent branch edit"));
		assert.equal(loaded.tree.getSharedBranchName(branchId), "retained branch");
		assert.deepEqual(
			loaded.tree.kernel.getHistoryRetentionState(),
			tree.kernel.getHistoryRetentionState(),
		);
	});

	it("preserves removal repair data and revertibles across enabling and disabling", async () => {
		const { clients, views, synchronize, advanceWindow } = setup();
		views[0].root.insertAtEnd("restore this node");
		synchronize();
		const { undoStack, redoStack, unsubscribe } = createTestUndoRedoStacks(
			clients[0].tree.kernel.checkout.events,
		);
		views[0].root.removeAt(0);
		synchronize();
		assert.equal(undoStack.length, 1);
		for (const retainHistory of [true, false, true, false]) {
			const request = configuration(clients[0].tree).requestChange({ retainHistory });
			synchronize();
			await request;
		}
		// Advance the window without adding more local undo entries.
		for (let i = 0; i < 3; i++) {
			views[1].root.insertAtEnd(`remote-${i}`);
			synchronize();
			const request = configuration(clients[0].tree).requestChange({});
			synchronize();
			await request;
		}
		const undo = undoStack.pop();
		assert(undo !== undefined);
		undo.revert();
		synchronize();
		assert(views[0].root.includes("restore this node"));
		assert.deepEqual([...views[0].root], [...views[1].root]);
		const redo = redoStack.pop();
		assert(redo !== undefined);
		redo.revert();
		synchronize();
		assert(!views[1].root.includes("restore this node"));
		unsubscribe();
		advanceWindow();
	});

	it("applies detached configuration synchronously without submitting an operation", async () => {
		const { tree, runtime, view, submitted } = detached();
		view.root.insertAtEnd("before the detached barrier");
		const prior = historyBlob(await summarize(tree));
		assert.equal(typeof prior.detachedSequenceNumber, "number");
		const changes: ChannelConfigurationChange<Configuration>[] = [];
		const listener = (change: ChannelConfigurationChange<Configuration>): void => {
			changes.push(change);
			assert.deepEqual(configuration(tree).current, change.current);
		};
		configuration(tree).on("changed", listener);
		const request = configuration(tree).requestChange({ retainHistory: true });
		assert.equal(changes.length, 1, "Detached notification is synchronous");
		assert.equal(changes[0].source, "local");
		assert.deepEqual(tree.kernel.getHistoryRetentionState(), {
			version: 1,
			start: {
				revision: 1,
				sequenceNumber: (prior.detachedSequenceNumber as number) + 1,
				indexInBatch: 0,
			},
		});
		const result = await request;
		assert.equal(result.source, "local");
		configuration(tree).off("changed", listener);
		await configuration(tree).requestChange({ retainHistory: true });
		assert.equal(changes.length, 1);
		view.root.insertAtEnd("retained while detached");
		assert.deepEqual(submitted, []);
		const loaded = await load(
			await summarize(tree),
			compressor(runtime),
			factory(),
			AttachState.Detached,
		);
		assert.deepEqual(
			loaded.tree.kernel.getHistoryRetentionState(),
			tree.kernel.getHistoryRetentionState(),
		);
		assert.deepEqual(loaded.submitted, []);
	});

	it("preserves the detached cursor through summary reload, local changes, and attach", async () => {
		const source = detached();
		for (let i = 0; i < 5; i++) {
			source.view.root.insertAtEnd(`detached-${i}`);
		}
		const summary = await summarize(source.tree);
		const prior = historyBlob(summary);
		assert.equal(typeof prior.detachedSequenceNumber, "number");
		const loaded = await load(
			summary,
			compressor(source.runtime),
			factory(),
			AttachState.Detached,
		);
		await configuration(loaded.tree).requestChange({ retainHistory: true });
		const state = loaded.tree.kernel.getHistoryRetentionState();
		assert.deepEqual(state, {
			version: 1,
			start: {
				revision: 1,
				sequenceNumber: (prior.detachedSequenceNumber as number) + 1,
				indexInBatch: 0,
			},
		});
		loaded.tree.viewWith(viewConfiguration).root.insertAtEnd("after reload");
		await configuration(loaded.tree).requestChange({ retainHistory: true });
		assert.deepEqual(loaded.submitted, []);
		loaded.runtime.setAttachState(AttachState.Attached);
		publish(loaded.tree);
		const attached = await load(await summarize(loaded.tree), compressor(source.runtime));
		assert.deepEqual(attached.tree.kernel.getHistoryRetentionState(), state);
		assert(attached.tree.viewWith(viewConfiguration).root.includes("after reload"));
	});

	it("preserves the detached cursor when enabling is followed by a summary with no retained commits", async () => {
		const source = detached();
		for (let i = 0; i < 5; i++) {
			source.view.root.insertAtEnd(`before-enable-${i}`);
		}
		await configuration(source.tree).requestChange({ retainHistory: true });
		const enabledState = source.tree.kernel.getHistoryRetentionState();
		assert(enabledState !== undefined && enabledState.start !== null);
		assert(enabledState.start.sequenceNumber > Number.MIN_SAFE_INTEGER + 1);

		// No edit follows enable: trimming removes every trunk commit that could restore the cursor.
		const summary = await summarize(source.tree);
		assert.equal(source.tree.kernel.checkout.branchHistory.length, 0);
		assert.equal(
			historyBlob(summary).detachedSequenceNumber,
			enabledState.start.sequenceNumber - 1,
		);
		const loaded = await load(
			summary,
			compressor(source.runtime),
			factory(),
			AttachState.Detached,
		);
		assert.equal(loaded.tree.kernel.checkout.branchHistory.length, 0);
		assert.deepEqual(loaded.tree.kernel.getHistoryRetentionState(), enabledState);

		await configuration(loaded.tree).requestChange({});
		await configuration(loaded.tree).requestChange({ retainHistory: true });
		assert.deepEqual(loaded.tree.kernel.getHistoryRetentionState(), {
			version: 1,
			start: { ...enabledState.start, revision: 3 },
		});
		const view = loaded.tree.viewWith(viewConfiguration);
		assert.deepEqual([...view.root], [...source.view.root]);
		view.root.insertAtEnd("first retained edit");
		const retainedEdit = headRevision(loaded.tree);
		const updatedSummary = await summarize(loaded.tree);
		assert.equal(
			historyBlob(updatedSummary).detachedSequenceNumber,
			enabledState.start.sequenceNumber,
		);
		const reloaded = await load(
			updatedSummary,
			compressor(source.runtime),
			factory(),
			AttachState.Detached,
		);
		assert(revisions(reloaded.tree).includes(retainedEdit));
		assert.deepEqual([...reloaded.tree.viewWith(viewConfiguration).root], [...view.root]);
		assert.deepEqual(loaded.submitted, []);
	});

	it("keeps an offline published request pending until sequencing and retains its pending edit", async () => {
		const { clients, views, synchronize, advanceWindow } = setup();
		clients[0].containerRuntime.connected = false;
		let completed = false;
		const request = configuration(clients[0].tree)
			.requestChange({ retainHistory: true })
			.then((result) => {
				completed = true;
				return result;
			});
		views[0].root.insertAtEnd("offline edit");
		const offlineEdit = headRevision(clients[0].tree);
		await Promise.resolve();
		assert.equal(completed, false);
		assert.equal(configuration(clients[0].tree).current.revision, 0);
		assert.deepEqual(clients[0].tree.kernel.getHistoryRetentionState(), {
			version: 1,
			start: null,
		});
		clients[0].containerRuntime.connected = true;
		synchronize();
		const sequencedResult = await request;
		assert.equal(sequencedResult.source, "sequenced");
		advanceWindow();
		for (let i = 0; i < clients.length; i++) {
			assert(revisions(clients[i].tree).includes(offlineEdit));
			assert(views[i].root.includes("offline edit"));
		}
	});

	it("resubmits an optimistic edit after reconnecting across a remote history barrier", async () => {
		const { clients, views, synchronize, advanceWindow } = setup();
		clients[0].containerRuntime.connected = false;
		views[0].root.insertAtEnd("pending before the barrier");
		const pendingRevision = headRevision(clients[0].tree);
		assert.deepEqual([...views[0].root], ["pending before the barrier"]);
		assert.deepEqual([...views[1].root], []);

		const request = configuration(clients[1].tree).requestChange({ retainHistory: true });
		synchronize();
		await request;
		assert.equal(configuration(clients[0].tree).current.revision, 0);
		clients[0].containerRuntime.connected = true;
		assert.equal(configuration(clients[0].tree).current.revision, 1);
		assert.deepEqual([...views[0].root], ["pending before the barrier"]);
		synchronize();
		assert.deepEqual([...views[1].root], ["pending before the barrier"]);
		advanceWindow();
		for (const client of clients) {
			assert(revisions(client.tree).includes(pendingRevision));
			const loaded = await load(await summarize(client.tree), compressor(client.runtime));
			assert(revisions(loaded.tree).includes(pendingRevision));
			assert.equal(
				[...loaded.tree.viewWith(viewConfiguration).root].filter(
					(value) => value === "pending before the barrier",
				).length,
				1,
			);
		}
	});

	it("applies and resubmits a stashed Tree edit under its original revision after a history barrier", async () => {
		const { clients } = setup();
		const snapshot = await summarize(clients[0].tree);
		const idCompressor = compressor(clients[0].runtime);
		const original = await load(snapshot, idCompressor);
		original.tree.viewWith(viewConfiguration).root.insertAtEnd("stashed edit");
		const stashedRevision = headRevision(original.tree);
		assert.equal(original.submitted.length, 1);
		const [stashed] = original.submitted;
		assert.equal(operationRevision(stashed.contents), 0);

		const restored = await load(snapshot, idCompressor);
		deliverMessage(
			restored.delta,
			{
				version: 1,
				kind: "configuration",
				expectedRevision: 0,
				values: { retainHistory: true },
			},
			100,
		);
		const state = restored.tree.kernel.getHistoryRetentionState();
		const view = restored.tree.viewWith(viewConfiguration);
		restored.delta.applyStashedOp(stashed.contents);
		assert.deepEqual([...view.root], ["stashed edit"]);
		assert.equal(headRevision(restored.tree), stashedRevision);
		assert.equal(restored.submitted.length, 1);
		const [replayed] = restored.submitted;
		assert.equal(operationRevision(replayed.contents), 0);
		assert.equal(configuration(restored.tree).current.revision, 1);

		restored.delta.reSubmit(replayed.contents, replayed.metadata, false);
		assert.equal(restored.submitted.length, 2);
		const resubmitted = restored.submitted[1];
		assert.equal(operationRevision(resubmitted.contents), 0);
		assert.deepEqual([...view.root], ["stashed edit"]);
		deliverMessage(restored.delta, resubmitted.contents, 101, true, resubmitted.metadata);
		assert.deepEqual([...view.root], ["stashed edit"]);
		assert.deepEqual(restored.tree.kernel.getHistoryRetentionState(), state);

		view.root.insertAtEnd("new edit");
		const fresh = restored.submitted[2];
		assert.equal(operationRevision(fresh.contents), 1);
		deliverMessage(restored.delta, fresh.contents, 102, true, fresh.metadata);
		const loaded = await load(await summarize(restored.tree), idCompressor);
		assert.deepEqual(
			[...loaded.tree.viewWith(viewConfiguration).root],
			["stashed edit", "new edit"],
		);
		assert(revisions(loaded.tree).includes(stashedRevision));
	});

	it("rolls back an optimistic Tree edit after a history barrier without rolling back configuration", async () => {
		const { clients, views, runtimeFactory, synchronize, advanceWindow } = setup({}, true);
		views[0].root.insertAtEnd("preserve this node");
		synchronize();
		views[0].root.removeAt(0);
		const rolledBackRevision = headRevision(clients[0].tree);
		assert.deepEqual([...views[0].root], []);
		assert.deepEqual([...views[1].root], ["preserve this node"]);

		const request = configuration(clients[1].tree).requestChange({ retainHistory: true });
		// Only flush the other client, leaving the optimistic removal available for rollback.
		clients[1].containerRuntime.flush();
		runtimeFactory.processAllMessages();
		await request;
		const state = clients[0].tree.kernel.getHistoryRetentionState();
		assert.equal(configuration(clients[0].tree).current.revision, 1);
		assert(clients[0].containerRuntime.rollback !== undefined);
		clients[0].containerRuntime.rollback();
		assert.deepEqual([...views[0].root], ["preserve this node"]);
		assert(!revisions(clients[0].tree).includes(rolledBackRevision));
		assert.deepEqual(clients[0].tree.kernel.getHistoryRetentionState(), state);

		views[0].root.insertAtEnd("after rollback");
		const retainedRevision = headRevision(clients[0].tree);
		synchronize();
		assert.deepEqual([...views[1].root], ["preserve this node", "after rollback"]);
		advanceWindow();
		for (const client of clients) {
			const loaded = await load(await summarize(client.tree), compressor(client.runtime));
			assert(!revisions(loaded.tree).includes(rolledBackRevision));
			assert(revisions(loaded.tree).includes(retainedRevision));
			assert.deepEqual(loaded.tree.kernel.getHistoryRetentionState(), state);
		}
	});

	it("persists configuration-only changes without another Tree edit", async () => {
		const { clients, synchronize } = setup();
		const client = clients[0];
		const editsBefore = revisions(client.tree);
		const request = configuration(client.tree).requestChange({ retainHistory: true });
		synchronize();
		await request;
		assert.deepEqual(revisions(client.tree), editsBefore);
		const loaded = await load(await summarize(client.tree), compressor(client.runtime));
		assert.deepEqual(configuration(loaded.tree).current, configuration(client.tree).current);
		assert.deepEqual(
			loaded.tree.kernel.getHistoryRetentionState(),
			client.tree.kernel.getHistoryRetentionState(),
		);
	});

	it("restores the snapshot epoch before replaying trailing configuration barriers", async () => {
		const { clients, views, synchronize, advanceWindow } = setup({ retainHistory: true });
		views[0].root.insertAtEnd("retained by the snapshot");
		synchronize();
		advanceWindow();
		const loaded = await load(
			await summarize(clients[0].tree),
			compressor(clients[0].runtime),
		);
		const initialState = loaded.tree.kernel.getHistoryRetentionState();
		loaded.delta.processMessages({
			envelope: {
				clientId: "remote",
				sequenceNumber: 100,
				referenceSequenceNumber: 0,
				minimumSequenceNumber: 0,
				timestamp: 0,
				type: MessageType.Operation,
			},
			local: false,
			messagesContent: [
				{
					version: 1,
					kind: "configuration",
					expectedRevision: 0,
					values: { retainHistory: true },
				},
				{ version: 1, kind: "configuration", expectedRevision: 1, values: {} },
				{
					version: 1,
					kind: "configuration",
					expectedRevision: 2,
					values: { retainHistory: true },
				},
			].map((contents, index) => ({
				contents,
				clientSequenceNumber: index + 1,
				localOpMetadata: undefined,
			})),
		});
		assert.equal(configuration(loaded.tree).current.revision, 3);
		assert.notDeepEqual(loaded.tree.kernel.getHistoryRetentionState(), initialState);
		assert.deepEqual(loaded.tree.kernel.getHistoryRetentionState(), {
			version: 1,
			start: { revision: 3, sequenceNumber: 100, indexInBatch: 0 },
		});
		const reloaded = await load(await summarize(loaded.tree), compressor(clients[0].runtime));
		assert.deepEqual(
			reloaded.tree.kernel.getHistoryRetentionState(),
			loaded.tree.kernel.getHistoryRetentionState(),
		);
	});

	it("prunes old archival history after a loaded configuration-only disable", async () => {
		const { clients, views, synchronize, advanceWindow } = setup({ retainHistory: true });
		views[0].root.insertAtEnd("old archived edit");
		const oldEdit = headRevision(clients[0].tree);
		synchronize();
		advanceWindow();
		const summary = await summarize(clients[0].tree);
		const savedMinimum = historyBlob(summary).minimumSequenceNumber;
		assert(typeof savedMinimum === "number" && savedMinimum > 0);
		const loaded = await load(summary, compressor(clients[0].runtime));
		assert(revisions(loaded.tree).includes(oldEdit));
		loaded.delta.processMessages({
			envelope: {
				clientId: "remote",
				sequenceNumber: 100,
				referenceSequenceNumber: 0,
				minimumSequenceNumber: 0,
				timestamp: 0,
				type: MessageType.Operation,
			},
			local: false,
			messagesContent: [
				{
					contents: { version: 1, kind: "configuration", expectedRevision: 0, values: {} },
					clientSequenceNumber: 1,
					localOpMetadata: undefined,
				},
			],
		});
		assert.deepEqual(loaded.tree.kernel.getHistoryRetentionState(), {
			version: 1,
			start: null,
		});
		assert(
			!revisions(loaded.tree).includes(oldEdit),
			"Config-only disable must use the restored collaboration window to trim immediately",
		);
		const reloaded = await load(await summarize(loaded.tree), compressor(clients[0].runtime));
		assert(!revisions(reloaded.tree).includes(oldEdit));
		assert(reloaded.tree.viewWith(viewConfiguration).root.includes("old archived edit"));
	});

	for (const [description, invalidValues] of [
		["unknown configuration keys", { retainHistory: true, unknownSetting: true }],
		["a non-boolean retainHistory flag", { retainHistory: "true" }],
	] as const) {
		it(`rejects ${description} during creation, requests, and persisted load`, async () => {
			const invalidConfiguration = invalidValues as unknown as Configuration;
			assert.throws(
				() => detached(invalidConfiguration),
				/Unsupported channel configuration values/,
			);
			const source = detached({ retainHistory: true });
			const previous = configuration(source.tree).current;
			const previousHistory = source.tree.kernel.getHistoryRetentionState();
			await assert.rejects(
				configuration(source.tree).requestChange(invalidConfiguration),
				/Unsupported channel configuration values/,
			);
			assert.deepEqual(configuration(source.tree).current, previous);
			assert.deepEqual(source.tree.kernel.getHistoryRetentionState(), previousHistory);
			assert.deepEqual(source.submitted, []);

			const summary = await summarize(source.tree);
			const attributesBlob = summary.tree[".attributes"];
			assert(attributesBlob?.type === SummaryType.Blob);
			assert.equal(typeof attributesBlob.content, "string");
			const attributes = JSON.parse(attributesBlob.content as string) as {
				configuration: { values: unknown };
			};
			attributes.configuration.values = invalidValues;
			const corrupt: ISummaryTree = {
				...summary,
				tree: {
					...summary.tree,
					".attributes": {
						type: SummaryType.Blob,
						content: JSON.stringify(attributes),
					},
				},
			};
			await assert.rejects(
				load(corrupt, compressor(source.runtime)),
				/Unsupported channel configuration values/,
			);
		});
	}

	for (const corruption of [
		"missing",
		"unsupported",
		"inconsistent",
		"missing detached cursor",
		"invalid detached cursor",
		"missing minimum sequence number",
		"invalid minimum sequence number",
	] as const) {
		it(`rejects ${corruption} persisted history metadata`, async () => {
			const { tree, runtime } = detached({ retainHistory: true });
			const summary = await summarize(tree);
			const { HistoryRetention: _history, ...otherEntries } = summary.tree;
			const history = historyBlob(summary);
			switch (corruption) {
				case "unsupported": {
					history.version = 2;
					break;
				}
				case "inconsistent": {
					history.start = null;
					break;
				}
				case "missing detached cursor": {
					delete history.detachedSequenceNumber;
					break;
				}
				case "invalid detached cursor": {
					history.detachedSequenceNumber = "invalid";
					break;
				}
				case "missing minimum sequence number": {
					delete history.minimumSequenceNumber;
					break;
				}
				case "invalid minimum sequence number": {
					history.minimumSequenceNumber = "invalid";
					break;
				}
				case "missing": {
					break;
				}
				default: {
					assert.fail("Unexpected history corruption case");
				}
			}
			const corrupt: ISummaryTree = {
				...summary,
				tree:
					corruption === "missing"
						? otherEntries
						: {
								...otherEntries,
								HistoryRetention: {
									type: SummaryType.Blob,
									content: JSON.stringify(history),
								},
							},
			};
			await assert.rejects(load(corrupt, compressor(runtime)), /history|History/);
		});
	}
});
