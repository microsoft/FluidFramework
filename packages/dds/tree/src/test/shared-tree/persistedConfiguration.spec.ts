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
	ChannelConfigurationFactory,
	ChannelConfigurationRuntime,
	IChannelAttributes,
	IChannelFactory,
} from "@fluidframework/datastore-definitions/internal";
import { SummaryType, type ISummaryTree } from "@fluidframework/driver-definitions";
import { MessageType } from "@fluidframework/driver-definitions/internal";
import type { IIdCompressor, SessionId } from "@fluidframework/id-compressor";
import {
	createSessionId,
	deserializeIdCompressor,
	serializeIdCompressor,
} from "@fluidframework/id-compressor/internal";
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
import type { EncodedRevisionTag } from "../../core/index.js";
import { FormatValidatorBasic } from "../../external-utilities/index.js";
import type { SharedTreeOptions } from "../../shared-tree/index.js";
import { EditManagerFormatVersion } from "../../shared-tree-core/index.js";
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

function configureRuntime(runtime: MockFluidDataStoreRuntime, enabled = true): void {
	Object.assign(runtime, {
		isSharedObjectConfigurationEnabled: () => enabled,
	});
}

function configuration(tree: ISharedTree): ChannelConfigurationFacet<Configuration> {
	const facet = tree.kernel.configuration;
	assert(facet !== undefined, "Expected a configured Tree");
	return facet;
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
	configurationEnabled = true,
) {
	const runtime = new MockFluidDataStoreRuntime({ idCompressor, attachState });
	configureRuntime(runtime, configurationEnabled);
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

interface EncodedHistoryCommit {
	revision: EncodedRevisionTag;
	sessionId: SessionId;
	sequenceNumber: number;
}

interface EditManagerSummary {
	version: number;
	historyStart?: EncodedRevisionTag;
	trunk?: EncodedHistoryCommit[];
	main?: { trunk: EncodedHistoryCommit[] };
}

function editManagerBlob(summary: ISummaryTree): EditManagerSummary {
	assert.equal(summary.tree.HistoryRetention, undefined);
	const indexes = summary.tree.indexes;
	assert(indexes?.type === SummaryType.Tree, "Expected the indexes summary");
	const editManager = indexes.tree.EditManager;
	assert(editManager?.type === SummaryType.Tree, "Expected the EditManager summary");
	const blob = editManager.tree.String;
	assert(blob?.type === SummaryType.Blob, "Expected the EditManager String blob");
	assert.equal(typeof blob.content, "string");
	return JSON.parse(blob.content as string) as EditManagerSummary;
}

function assertUnmarkedSummary(summary: ISummaryTree): void {
	const attributes = summary.tree[".attributes"];
	assert(attributes?.type === SummaryType.Blob, "Expected persisted channel attributes");
	assert.equal(typeof attributes.content, "string");
	assert.equal(
		Object.hasOwn(
			JSON.parse(attributes.content as string) as IChannelAttributes,
			"configuration",
		),
		false,
	);
	const history = editManagerBlob(summary);
	assert.equal(history.version, EditManagerFormatVersion.v3);
	assert.equal(Object.hasOwn(history, "historyStart"), false);
}

function mainTrunk(summary: EditManagerSummary): EncodedHistoryCommit[] {
	const trunk = summary.main?.trunk ?? summary.trunk;
	assert(trunk !== undefined, "Expected the main trunk");
	return trunk;
}

function historyStart(tree: ISharedTree, idCompressor: IIdCompressor): string | undefined {
	const summary = editManagerBlob(tree.getAttachSummary().summary);
	const marker = summary.historyStart;
	if (marker === undefined) {
		return undefined;
	}
	assert.notEqual(marker, "root", "History must start at a committed change");
	const commit = mainTrunk(summary).find(({ revision }) => revision === marker);
	assert(commit !== undefined, "The history start must reference a main-trunk commit");
	assert(typeof marker === "number", "Expected an encoded compressed revision");
	return idCompressor.decompress(
		idCompressor.normalizeToSessionSpace(marker, commit.sessionId),
	);
}

function deliverMessage(
	delta: MockDeltaConnection,
	contents: unknown,
	sequenceNumber: number,
	local = false,
	localOpMetadata?: unknown,
	minimumSequenceNumber = 0,
): void {
	delta.processMessages({
		envelope: {
			clientId: "client",
			sequenceNumber,
			referenceSequenceNumber: 0,
			minimumSequenceNumber,
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
		const creator = factory();
		const reader = factory();
		let rolloutEnabled = true;
		const loadedTrees: ISharedTree[] = [];
		const channelFactory: IChannelFactory<ISharedTree> & ChannelConfigurationFactory = {
			type: creator.type,
			attributes: creator.attributes,
			get channelConfigurationProtocolVersion() {
				return (reader as IChannelFactory<ISharedTree> & ChannelConfigurationFactory)
					.channelConfigurationProtocolVersion;
			},
			create: (runtime, id) => {
				const capabilities = runtime as ChannelConfigurationRuntime;
				assert.equal(capabilities.isSharedObjectConfigurationEnabled?.(), true);
				return creator.create(runtime, id);
			},
			load: async (runtime, id, services, attributes) => {
				const capabilities = runtime as ChannelConfigurationRuntime;
				assert.equal(capabilities.isSharedObjectConfigurationEnabled?.(), true);
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
						enableSharedObjectConfiguration: rolloutEnabled,
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
			assert.deepEqual(configuration(tree).current, { revision: 0, values: {} });
			assert.equal(Object.hasOwn(tree.attributes, "configuration"), false);
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
			const expectedStart = editManagerBlob(await summarize(tree)).historyStart;
			assert.notEqual(expectedStart, undefined);

			rolloutEnabled = false;
			const { summarizer } = await createSummarizer(provider, container);
			await summarizeNow(summarizer, "initial configured Tree summary");
			assert(loadedTrees.length > 0, "The real summarizer must load the configured channel");
			for (const summarizedTree of loadedTrees) {
				assert.deepEqual(configuration(summarizedTree).current.values, {
					retainHistory: true,
				});
				assert.equal(
					editManagerBlob(await summarize(summarizedTree)).historyStart,
					expectedStart,
				);
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
			assert.equal(editManagerBlob(await summarize(loaded)).historyStart, expectedStart);
			assert(revisions(loaded).includes(retainedEdit));
			assert.deepEqual(
				[...loaded.viewWith(viewConfiguration).root],
				["before enable", "after enable"],
			);
		} finally {
			provider.reset();
		}
	});

	for (const enabled of [false, true]) {
		it(`keeps default-backed summaries unmarked with the document capability ${enabled ? "on" : "off"}`, async () => {
			const runtime = new MockFluidDataStoreRuntime({ attachState: AttachState.Detached });
			configureRuntime(runtime, enabled);
			const legacy = factory().create(runtime, "legacy");
			assert.deepEqual(configuration(legacy).current, { revision: 0, values: {} });
			assert.equal(Object.hasOwn(legacy.attributes, "configuration"), false);
			assertUnmarkedSummary(await summarize(legacy));
			const view = legacy.viewWith(viewConfiguration);
			view.initialize([]);
			view.root.insertAtEnd("legacy history");
			const summary = await summarize(legacy);
			assertUnmarkedSummary(summary);
			const loaded = await load(
				summary,
				compressor(runtime),
				factory({ retainHistory: true }),
				AttachState.Attached,
				enabled,
			);
			assert.deepEqual(configuration(loaded.tree).current, { revision: 0, values: {} });
			assert.equal(Object.hasOwn(loaded.tree.attributes, "configuration"), false);
			assert.equal(historyStart(loaded.tree, compressor(loaded.runtime)), undefined);
			assert.deepEqual([...loaded.tree.viewWith(viewConfiguration).root], ["legacy history"]);
			const resummarized = await summarize(loaded.tree);
			assertUnmarkedSummary(resummarized);
			const reloaded = await load(
				resummarized,
				compressor(runtime),
				factory(),
				AttachState.Detached,
				enabled,
			);
			assert.deepEqual(configuration(reloaded.tree).current, { revision: 0, values: {} });
			reloaded.tree.viewWith(viewConfiguration).root.insertAtEnd("still bounded");
			assertUnmarkedSummary(await summarize(reloaded.tree));
		});
	}

	for (const attachState of [AttachState.Attached, AttachState.Detached]) {
		it(`activates an existing unmarked ${attachState} Tree and waits for its first committed change`, async () => {
			const runtime = new MockFluidDataStoreRuntime({ attachState: AttachState.Detached });
			const source = factory().create(runtime, "unmarked");
			const sourceView = source.viewWith(viewConfiguration);
			sourceView.initialize([]);
			sourceView.root.insertAtEnd("before activation");
			const summary = await summarize(source);
			assertUnmarkedSummary(summary);
			const loaded = await load(
				summary,
				compressor(runtime),
				factory({ retainHistory: true }),
				attachState,
			);
			assert.deepEqual(configuration(loaded.tree).current, { revision: 0, values: {} });
			const before = revisions(loaded.tree);
			const request = configuration(loaded.tree).requestChange({ retainHistory: true });
			if (attachState === AttachState.Attached) {
				assert.equal(loaded.submitted.length, 1);
				assert.deepEqual(configuration(loaded.tree).current, { revision: 0, values: {} });
				const pending = await summarize(loaded.tree);
				assertUnmarkedSummary(pending);
				const pendingReload = await load(pending, compressor(runtime));
				assert.deepEqual(configuration(pendingReload.tree).current, {
					revision: 0,
					values: {},
				});
				assertUnmarkedSummary(await summarize(pendingReload.tree));
				const proposal = loaded.submitted[0];
				deliverMessage(loaded.delta, proposal.contents, 100, true, proposal.metadata);
			} else {
				assert.equal(loaded.submitted.length, 0);
				assert.equal(configuration(loaded.tree).current.values.retainHistory, true);
			}
			const result = await request;
			assert.equal(result.status, "applied");
			assert.equal(
				result.source,
				attachState === AttachState.Attached ? "sequenced" : "local",
			);
			assert.equal(Object.hasOwn(loaded.tree.attributes, "configuration"), true);
			assert.deepEqual(revisions(loaded.tree), before);
			assert.equal(historyStart(loaded.tree, compressor(runtime)), undefined);

			// Activation is persisted even though no Tree commit has established the history start.
			const activated = await load(
				await summarize(loaded.tree),
				compressor(runtime),
				factory(),
				attachState,
			);
			assert.deepEqual(configuration(activated.tree).current, {
				revision: 1,
				values: { retainHistory: true },
			});
			assert.equal(historyStart(activated.tree, compressor(runtime)), undefined);
			const view = activated.tree.viewWith(viewConfiguration);
			assert.deepEqual([...view.root], ["before activation"]);
			view.root.insertAtEnd("first retained edit");
			const retainedEdit = headRevision(activated.tree);
			if (attachState === AttachState.Attached) {
				assert.equal(activated.submitted.length, 1);
				const edit = activated.submitted[0];
				deliverMessage(activated.delta, edit.contents, 101, true, edit.metadata);
			} else {
				assert.equal(activated.submitted.length, 0);
			}
			assert.equal(historyStart(activated.tree, compressor(runtime)), retainedEdit);
			const reloaded = await load(
				await summarize(activated.tree),
				compressor(runtime),
				factory(),
				attachState,
			);
			assert.equal(historyStart(reloaded.tree, compressor(runtime)), retainedEdit);
			assert.deepEqual([...reloaded.tree.viewWith(viewConfiguration).root], [...view.root]);
		});
	}

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
			const expectedStart = historyStart(source.tree, compressor(source.runtime));
			assert.equal(expectedStart !== undefined, initialConfiguration.retainHistory === true);
			for (const reader of [
				factory(),
				factory({ retainHistory: !initialConfiguration.retainHistory }),
				configuredSharedTreeInternal(
					{ jsonValidator: FormatValidatorBasic },
					{ retainHistory: true },
				).getFactory() as IChannelFactory<ISharedTree>,
			]) {
				const loaded = await load(summary, compressor(source.runtime), reader);
				assert.deepEqual(configuration(loaded.tree).current.values, initialConfiguration);
				assert.equal(historyStart(loaded.tree, compressor(loaded.runtime)), expectedStart);
				assert.deepEqual(revisions(loaded.tree), revisions(source.tree));
				// A reader-only client must preserve the same policy when it becomes the summarizer.
				const resummarized = await summarize(loaded.tree);
				const reloaded = await load(resummarized, compressor(source.runtime));
				assert.deepEqual(configuration(reloaded.tree).current.values, initialConfiguration);
				assert.equal(historyStart(reloaded.tree, compressor(reloaded.runtime)), expectedStart);
				assert.deepEqual(revisions(reloaded.tree), revisions(source.tree));
			}
		});
	}

	it("resolves the encoded history start with another compressor session", async () => {
		const { clients, views, synchronize, advanceWindow } = setup();
		const source = clients[0];
		const request = configuration(source.tree).requestChange({ retainHistory: true });
		synchronize();
		await request;
		views[0].root.insertAtEnd("first retained revision");
		const firstEdit = headRevision(source.tree);
		synchronize();
		advanceWindow();
		const summary = await summarize(source.tree);
		const encoded = editManagerBlob(summary);
		assert(
			mainTrunk(encoded).some(({ revision }) => revision === encoded.historyStart),
			"The marker uses the same encoded revision as the referenced main-trunk commit",
		);
		const targetCompressor = deserializeIdCompressor(
			serializeIdCompressor(compressor(source.runtime), false),
			createSessionId(),
		);
		assert.notEqual(
			targetCompressor.localSessionId,
			compressor(source.runtime).localSessionId,
		);
		const loaded = await load(summary, targetCompressor);
		assert.equal(historyStart(loaded.tree, targetCompressor), firstEdit);
		assert.deepEqual(revisions(loaded.tree), revisions(source.tree));
		assert.deepEqual([...loaded.tree.viewWith(viewConfiguration).root], [...views[0].root]);
		const resummarized = await summarize(loaded.tree);
		assert.equal(editManagerBlob(resummarized).historyStart, encoded.historyStart);
		const reloaded = await load(resummarized, compressor(clients[1].runtime));
		assert.equal(historyStart(reloaded.tree, compressor(reloaded.runtime)), firstEdit);
	});

	it("waits for the first local committed change when initially enabled", async () => {
		const runtime = new MockFluidDataStoreRuntime({ attachState: AttachState.Detached });
		configureRuntime(runtime);
		const tree = factory({ retainHistory: true }).create(runtime, "initially-enabled");
		tree.connect({
			deltaConnection: runtime.createDeltaConnection(),
			objectStorage: new MockStorage(),
		});
		assert.equal(historyStart(tree, compressor(runtime)), undefined);
		const loaded = await load(
			await summarize(tree),
			compressor(runtime),
			factory(),
			AttachState.Detached,
		);
		assert.equal(historyStart(loaded.tree, compressor(loaded.runtime)), undefined);
		const view = loaded.tree.viewWith(viewConfiguration);
		view.initialize([]);
		const first = historyStart(loaded.tree, compressor(loaded.runtime));
		assert(first !== undefined, "Initialization commits the first retained change");
		assert(revisions(loaded.tree).includes(first));
		view.root.insertAtEnd("later local change");
		assert.equal(historyStart(loaded.tree, compressor(loaded.runtime)), first);
	});

	it("waits for the first sequenced change when initially enabled", async () => {
		const runtimeFactory = new MockContainerRuntimeFactoryWithOpBunching();
		const runtime = new MockFluidDataStoreRuntime();
		const containerRuntime = runtimeFactory.createContainerRuntime(runtime);
		configureRuntime(runtime);
		const tree = factory({ retainHistory: true }).create(runtime, "initially-enabled");
		tree.connect({
			deltaConnection: runtime.createDeltaConnection(),
			objectStorage: new MockStorage(),
		});
		assert.equal(historyStart(tree, compressor(runtime)), undefined);
		const view = tree.viewWith(viewConfiguration);
		view.initialize([]);
		containerRuntime.flush();
		runtimeFactory.processAllMessages();
		const first = historyStart(tree, compressor(runtime));
		assert(first !== undefined, "Sequenced initialization establishes the retained start");
		assert(revisions(tree).includes(first));
		const loaded = await load(await summarize(tree), compressor(runtime));
		assert.equal(historyStart(loaded.tree, compressor(loaded.runtime)), first);
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
		for (const client of clients) {
			assert.equal(historyStart(client.tree, compressor(client.runtime)), undefined);
			const loaded = await load(await summarize(client.tree), compressor(client.runtime));
			assert.equal(configuration(loaded.tree).current.values.retainHistory, true);
			assert.equal(historyStart(loaded.tree, compressor(loaded.runtime)), undefined);
			loaded.tree.viewWith(viewConfiguration).root.insertAtEnd("first change after reload");
			const firstLoadedEdit = headRevision(loaded.tree);
			const edit = loaded.submitted[0];
			deliverMessage(loaded.delta, edit.contents, 100, true, edit.metadata);
			assert.equal(
				historyStart(loaded.tree, compressor(loaded.runtime)),
				firstLoadedEdit,
				"Loading older history must not backfill a pending history start",
			);
		}
		views[0].root.insertAtEnd("after enable");
		const after = headRevision(clients[0].tree);
		synchronize();
		for (const client of clients) {
			assert.equal(historyStart(client.tree, compressor(client.runtime)), after);
		}
		advanceWindow();
		assert(revisions(clients[0].tree).includes(before), "The fork still needs old history");
		for (const client of clients) {
			const loaded = await load(await summarize(client.tree), compressor(client.runtime));
			assert(!revisions(loaded.tree).includes(before), "Fork history is not archival history");
			assert(revisions(loaded.tree).includes(after));
			assert.equal(historyStart(loaded.tree, compressor(loaded.runtime)), after);
		}
		fork.root.insertAtEnd("fork edit");
		fork.rebaseOnto(views[0]);
		views[0].merge(fork);
		synchronize();
		assert(views[1].root.includes("fork edit"));
	});

	it("pins sequenced order rather than local optimistic order", async () => {
		const { clients, views, synchronize, runtimeFactory } = setup({}, true);
		const request = configuration(clients[0].tree).requestChange({ retainHistory: true });
		synchronize();
		await request;
		views[0].root.insertAtEnd("optimistic first");
		const optimisticEdit = headRevision(clients[0].tree);
		views[1].root.insertAtEnd("sequenced first");
		const firstSequencedEdit = headRevision(clients[1].tree);
		clients[1].containerRuntime.flush();
		runtimeFactory.processAllMessages();
		assert.equal(
			historyStart(clients[1].tree, compressor(clients[1].runtime)),
			firstSequencedEdit,
		);
		synchronize();
		for (const client of clients) {
			assert.equal(historyStart(client.tree, compressor(client.runtime)), firstSequencedEdit);
			assert(revisions(client.tree).includes(optimisticEdit));
		}
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
		for (const client of clients) {
			assert.equal(historyStart(client.tree, compressor(client.runtime)), oldRevisionEdit);
		}
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

	it("pins the first committed Tree revision after a configuration change within one sequence", async () => {
		const { clients, views, synchronize, advanceWindow } = setup({}, true);
		const tree = clients[0].tree;
		const noop = configuration(tree).requestChange({});
		synchronize();
		await noop;
		views[0].root.insertAtEnd("before the grouped barrier");
		const before = headRevision(tree);
		views[0].root.insertAtEnd("also before the grouped barrier");
		const secondBefore = headRevision(tree);
		// An obsolete proposal occupies a message index, but is neither a Tree commit nor a new revision.
		clients[0].containerRuntime.submit(
			{
				version: 1,
				isChannelConfigurationOp: true,
				expectedRevision: 0,
				values: {},
			},
			undefined,
		);
		const pending = configuration(tree).requestChange({ retainHistory: true });
		views[0].root.insertAtEnd("after the grouped barrier");
		const after = headRevision(tree);
		views[0].root.insertAtEnd("also after the grouped barrier");
		const secondAfter = headRevision(tree);
		synchronize();
		const result = await pending;
		assert(result.source === "sequenced");
		assert.equal(historyStart(tree, compressor(clients[0].runtime)), after);
		const commits = mainTrunk(editManagerBlob(await summarize(tree)));
		const groupedCommits = commits.filter(
			({ sequenceNumber }) => sequenceNumber === result.sequenceNumber,
		);
		assert.equal(groupedCommits.length, 4, "All four Tree commits share the barrier sequence");
		advanceWindow();
		for (const client of clients) {
			const loaded = await load(await summarize(client.tree), compressor(client.runtime));
			assert(!revisions(loaded.tree).includes(before));
			assert(!revisions(loaded.tree).includes(secondBefore));
			assert(revisions(loaded.tree).includes(after));
			assert(revisions(loaded.tree).includes(secondAfter));
			assert.equal(historyStart(loaded.tree, compressor(loaded.runtime)), after);
		}
	});

	it("keeps an identical enabled replacement at the same start and waits again after reenabling", async () => {
		const { clients, views, synchronize, advanceWindow } = setup();
		const tree = clients[0].tree;
		let request = configuration(tree).requestChange({ retainHistory: true });
		synchronize();
		await request;
		assert.equal(historyStart(tree, compressor(clients[0].runtime)), undefined);
		request = configuration(tree).requestChange({ retainHistory: true });
		synchronize();
		await request;
		assert.equal(historyStart(tree, compressor(clients[0].runtime)), undefined);
		views[0].root.insertAtEnd("first retained change");
		const firstEdit = headRevision(tree);
		synchronize();
		request = configuration(tree).requestChange({ retainHistory: true });
		synchronize();
		await request;
		assert.equal(configuration(tree).current.revision, 3);
		assert.equal(historyStart(tree, compressor(clients[0].runtime)), firstEdit);
		const loaded = await load(await summarize(tree), compressor(clients[0].runtime));
		assert.equal(configuration(loaded.tree).current.revision, 3);
		assert.equal(historyStart(loaded.tree, compressor(loaded.runtime)), firstEdit);
		request = configuration(tree).requestChange({});
		synchronize();
		await request;
		assert.equal(historyStart(tree, compressor(clients[0].runtime)), undefined);
		advanceWindow();
		for (const client of clients) {
			assert(!revisions(client.tree).includes(firstEdit));
		}
		request = configuration(tree).requestChange({ retainHistory: true });
		synchronize();
		const reenable = await request;
		assert(reenable.source === "sequenced");
		assert.equal(historyStart(tree, compressor(clients[0].runtime)), undefined);
		views[0].root.insertAtEnd("new retained change");
		const secondEdit = headRevision(tree);
		synchronize();
		advanceWindow();
		const reloaded = await load(await summarize(tree), compressor(clients[0].runtime));
		assert(!revisions(reloaded.tree).includes(firstEdit));
		assert(revisions(reloaded.tree).includes(secondEdit));
		assert.equal(historyStart(reloaded.tree, compressor(reloaded.runtime)), secondEdit);
	});

	it("does not establish a start when enable is disabled before the first commit", async () => {
		const { clients, synchronize } = setup();
		for (const retainHistory of [true, false]) {
			const request = configuration(clients[0].tree).requestChange({ retainHistory });
			synchronize();
			await request;
			for (const client of clients) {
				assert.equal(historyStart(client.tree, compressor(client.runtime)), undefined);
				const loaded = await load(await summarize(client.tree), compressor(client.runtime));
				assert.equal(historyStart(loaded.tree, compressor(loaded.runtime)), undefined);
				assert.equal(configuration(loaded.tree).current.values.retainHistory, retainHistory);
			}
		}
	});

	it("does not change the winning retention policy when a concurrent proposal conflicts", async () => {
		const { clients, views, synchronize } = setup();
		const first = configuration(clients[0].tree).requestChange({ retainHistory: true });
		const second = configuration(clients[1].tree).requestChange({});
		synchronize();
		const [winner, loser] = await Promise.all([first, second]);
		assert.equal(winner.status, "applied");
		assert.equal(loser.status, "conflict");
		assert.equal(configuration(clients[0].tree).current.revision, 1);
		for (const client of clients) {
			assert.equal(historyStart(client.tree, compressor(client.runtime)), undefined);
		}
		views[0].root.insertAtEnd("winning configuration");
		const retainedEdit = headRevision(clients[0].tree);
		synchronize();
		for (const client of clients) {
			assert.equal(historyStart(client.tree, compressor(client.runtime)), retainedEdit);
		}
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
			assert.equal(historyStart(tree, compressor(clients[0].runtime)), undefined);
			branch.root.insertAtEnd(`branch edit while ${retainHistory}`);
			synchronize();
			assert.equal(
				historyStart(tree, compressor(clients[0].runtime)),
				undefined,
				"Shared-branch commits must not establish the main-trunk history start",
			);
			advanceWindow();
		}
		const loaded = await load(
			await summarize(tree),
			compressor(clients[0].runtime),
			factory(undefined, { enableSharedBranches: true }),
		);
		assert.deepEqual(
			[...loaded.tree.viewSharedBranchWith(branchId, viewConfiguration).root],
			[
				"shared base",
				"divergent branch edit",
				"branch edit while true",
				"branch edit while false",
				"branch edit while true",
			],
		);
		assert(!loaded.tree.viewWith(viewConfiguration).root.includes("divergent branch edit"));
		assert.equal(loaded.tree.getSharedBranchName(branchId), "retained branch");
		assert.equal(
			historyStart(loaded.tree, compressor(loaded.runtime)),
			historyStart(tree, compressor(clients[0].runtime)),
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
		assert.equal(historyStart(tree, compressor(runtime)), undefined);
		assert.equal(tree.isAttached(), false);
		const changes: ChannelConfigurationChange<Configuration>[] = [];
		const listener = (change: ChannelConfigurationChange<Configuration>): void => {
			changes.push(change);
			assert.deepEqual(configuration(tree).current, change.current);
		};
		configuration(tree).on("changed", listener);
		const request = configuration(tree).requestChange({ retainHistory: true });
		assert.equal(changes.length, 1, "Detached notification is synchronous");
		assert.equal(changes[0].source, "local");
		assert.equal(historyStart(tree, compressor(runtime)), undefined);
		const result = await request;
		assert.equal(result.source, "local");
		configuration(tree).off("changed", listener);
		await configuration(tree).requestChange({ retainHistory: true });
		assert.equal(changes.length, 1);
		view.root.insertAtEnd("retained while detached");
		const firstEdit = headRevision(tree);
		assert.equal(historyStart(tree, compressor(runtime)), firstEdit);
		assert.deepEqual(submitted, []);
		const loaded = await load(
			await summarize(tree),
			compressor(runtime),
			factory(),
			AttachState.Detached,
		);
		assert.equal(historyStart(loaded.tree, compressor(loaded.runtime)), firstEdit);
		assert.deepEqual(loaded.submitted, []);
	});

	it("keeps an unbound Tree local in an attached runtime until normal connection", async () => {
		const runtime = new MockFluidDataStoreRuntime({ attachState: AttachState.Attached });
		configureRuntime(runtime);
		const tree = factory(disabledConfiguration).create(runtime, "unbound");
		const submitted: { contents: unknown; metadata: unknown }[] = [];
		const delta = new MockDeltaConnection(
			(contents: unknown, metadata) => submitted.push({ contents, metadata }),
			() => {},
		);
		const view = tree.viewWith(viewConfiguration);
		view.initialize([]);
		view.root.insertAtEnd("before binding");
		tree.getAttachSummary();
		assert.equal(tree.isAttached(), false);
		const local = await configuration(tree).requestChange({ retainHistory: true });
		assert.equal(local.source, "local");
		assert.equal(historyStart(tree, compressor(runtime)), undefined);
		view.root.insertAtEnd("retained before binding");
		const firstEdit = headRevision(tree);
		assert.equal(historyStart(tree, compressor(runtime)), firstEdit);
		assert.equal(submitted.length, 0);

		tree.connect({ deltaConnection: delta, objectStorage: new MockStorage() });
		assert.equal(tree.isAttached(), true);
		assert.equal(historyStart(tree, compressor(runtime)), firstEdit);
		const request = configuration(tree).requestChange({ retainHistory: false });
		assert.equal(configuration(tree).current.values.retainHistory, true);
		assert.equal(historyStart(tree, compressor(runtime)), firstEdit);
		assert.equal(submitted.length, 1);
		const proposal = submitted[0];
		deliverMessage(delta, proposal.contents, 100, true, proposal.metadata);
		const sequenced = await request;
		assert.equal(sequenced.source, "sequenced");
		assert.equal(historyStart(tree, compressor(runtime)), undefined);
		assert.deepEqual([...view.root], ["before binding", "retained before binding"]);
	});

	it("starts at a detached change after reload and preserves it through normal attach", async () => {
		const source = detached();
		for (let i = 0; i < 5; i++) {
			source.view.root.insertAtEnd(`detached-${i}`);
		}
		const summary = await summarize(source.tree);
		assert.equal(editManagerBlob(summary).historyStart, undefined);
		const loaded = await load(
			summary,
			compressor(source.runtime),
			factory(),
			AttachState.Detached,
		);
		loaded.tree.getAttachSummary();
		assert.equal(loaded.tree.isAttached(), false);
		const local = await configuration(loaded.tree).requestChange({ retainHistory: true });
		assert.equal(local.source, "local");
		assert.equal(historyStart(loaded.tree, compressor(loaded.runtime)), undefined);
		loaded.tree.viewWith(viewConfiguration).root.insertAtEnd("after reload");
		const firstEdit = headRevision(loaded.tree);
		assert.equal(historyStart(loaded.tree, compressor(loaded.runtime)), firstEdit);
		await configuration(loaded.tree).requestChange({ retainHistory: true });
		assert.equal(loaded.submitted.length, 0);
		loaded.runtime.setAttachState(AttachState.Attaching);
		assert.equal(loaded.tree.isAttached(), true);
		assert.equal(historyStart(loaded.tree, compressor(loaded.runtime)), firstEdit);
		const request = configuration(loaded.tree).requestChange({ retainHistory: true });
		assert.equal(configuration(loaded.tree).current.revision, 2);
		assert.equal(loaded.submitted.length, 1);
		const proposal = loaded.submitted[0];
		deliverMessage(loaded.delta, proposal.contents, 100, true, proposal.metadata);
		const sequenced = await request;
		assert.equal(sequenced.source, "sequenced");
		assert.equal(configuration(loaded.tree).current.revision, 3);
		loaded.runtime.setAttachState(AttachState.Attached);
		const attached = await load(await summarize(loaded.tree), compressor(source.runtime));
		assert.equal(historyStart(attached.tree, compressor(attached.runtime)), firstEdit);
		assert(attached.tree.viewWith(viewConfiguration).root.includes("after reload"));
	});

	for (const attachBeforeEdit of [false, true]) {
		it(`preserves pending-start detached configuration through reload and ${attachBeforeEdit ? "attach" : "a local edit"}`, async () => {
			const source = detached();
			for (let i = 0; i < 5; i++) {
				source.view.root.insertAtEnd(`before-enable-${i}`);
			}
			await configuration(source.tree).requestChange({ retainHistory: true });
			assert.equal(historyStart(source.tree, compressor(source.runtime)), undefined);

			// No edit follows enable, so the summary has no retained history start.
			const summary = await summarize(source.tree);
			assert.equal(editManagerBlob(summary).historyStart, undefined);
			const loaded = await load(
				summary,
				compressor(source.runtime),
				factory(),
				AttachState.Detached,
			);
			assert.equal(configuration(loaded.tree).current.values.retainHistory, true);
			assert.equal(historyStart(loaded.tree, compressor(loaded.runtime)), undefined);
			const view = loaded.tree.viewWith(viewConfiguration);
			assert.deepEqual([...view.root], [...source.view.root]);
			if (attachBeforeEdit) {
				loaded.runtime.setAttachState(AttachState.Attaching);
				loaded.runtime.setAttachState(AttachState.Attached);
				assert.equal(loaded.tree.isAttached(), true);
				assert.equal(historyStart(loaded.tree, compressor(loaded.runtime)), undefined);
			}
			view.root.insertAtEnd("first retained edit");
			const retainedEdit = headRevision(loaded.tree);
			if (attachBeforeEdit) {
				assert.equal(loaded.submitted.length, 1);
				const edit = loaded.submitted[0];
				deliverMessage(loaded.delta, edit.contents, 100, true, edit.metadata);
			} else {
				assert.deepEqual(loaded.submitted, []);
			}
			assert.equal(historyStart(loaded.tree, compressor(loaded.runtime)), retainedEdit);
			const reloaded = await load(
				await summarize(loaded.tree),
				compressor(source.runtime),
				factory(),
				attachBeforeEdit ? AttachState.Attached : AttachState.Detached,
			);
			assert.equal(historyStart(reloaded.tree, compressor(reloaded.runtime)), retainedEdit);
			assert(revisions(reloaded.tree).includes(retainedEdit));
			assert.deepEqual([...reloaded.tree.viewWith(viewConfiguration).root], [...view.root]);
		});
	}

	it("keeps an offline attached request pending until sequencing and retains its pending edit", async () => {
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
		assert.equal(historyStart(clients[1].tree, compressor(clients[1].runtime)), undefined);
		clients[0].containerRuntime.connected = true;
		synchronize();
		const sequencedResult = await request;
		assert.equal(sequencedResult.source, "sequenced");
		for (const client of clients) {
			assert.equal(historyStart(client.tree, compressor(client.runtime)), offlineEdit);
		}
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
		assert.equal(historyStart(clients[1].tree, compressor(clients[1].runtime)), undefined);
		clients[0].containerRuntime.connected = true;
		assert.equal(configuration(clients[0].tree).current.revision, 1);
		assert.deepEqual([...views[0].root], ["pending before the barrier"]);
		synchronize();
		assert.deepEqual([...views[1].root], ["pending before the barrier"]);
		for (const client of clients) {
			assert.equal(historyStart(client.tree, compressor(client.runtime)), pendingRevision);
		}
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

	it("applies and resubmits an unwrapped stashed Tree edit after a history barrier", async () => {
		const { clients } = setup();
		const snapshot = await summarize(clients[0].tree);
		const idCompressor = compressor(clients[0].runtime);
		const original = await load(snapshot, idCompressor);
		original.tree.viewWith(viewConfiguration).root.insertAtEnd("stashed edit");
		const stashedRevision = headRevision(original.tree);
		assert.equal(original.submitted.length, 1);
		const [stashed] = original.submitted;
		assert(typeof stashed.contents === "object" && stashed.contents !== null);
		assert(!Object.hasOwn(stashed.contents, "isChannelConfigurationOp"));

		const restored = await load(snapshot, idCompressor);
		deliverMessage(
			restored.delta,
			{
				version: 1,
				isChannelConfigurationOp: true,
				expectedRevision: 0,
				values: { retainHistory: true },
			},
			100,
		);
		assert.equal(historyStart(restored.tree, idCompressor), undefined);
		const view = restored.tree.viewWith(viewConfiguration);
		restored.delta.applyStashedOp(stashed.contents);
		assert.deepEqual([...view.root], ["stashed edit"]);
		assert.equal(headRevision(restored.tree), stashedRevision);
		assert.equal(restored.submitted.length, 1);
		const [replayed] = restored.submitted;
		assert.deepEqual(replayed.contents, stashed.contents);
		assert.equal(configuration(restored.tree).current.revision, 1);

		restored.delta.reSubmit(replayed.contents, replayed.metadata, false);
		assert.equal(restored.submitted.length, 2);
		const resubmitted = restored.submitted[1];
		assert.deepEqual(resubmitted.contents, stashed.contents);
		assert.deepEqual([...view.root], ["stashed edit"]);
		deliverMessage(restored.delta, resubmitted.contents, 101, true, resubmitted.metadata);
		assert.deepEqual([...view.root], ["stashed edit"]);
		assert.equal(historyStart(restored.tree, idCompressor), stashedRevision);

		view.root.insertAtEnd("new edit");
		const fresh = restored.submitted[2];
		assert(typeof fresh.contents === "object" && fresh.contents !== null);
		assert(!Object.hasOwn(fresh.contents, "isChannelConfigurationOp"));
		deliverMessage(restored.delta, fresh.contents, 102, true, fresh.metadata);
		const loaded = await load(await summarize(restored.tree), idCompressor);
		assert.deepEqual(
			[...loaded.tree.viewWith(viewConfiguration).root],
			["stashed edit", "new edit"],
		);
		assert(revisions(loaded.tree).includes(stashedRevision));
		assert.equal(historyStart(loaded.tree, idCompressor), stashedRevision);
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
		assert.equal(historyStart(clients[1].tree, compressor(clients[1].runtime)), undefined);
		assert.equal(configuration(clients[0].tree).current.revision, 1);
		assert(clients[0].containerRuntime.rollback !== undefined);
		clients[0].containerRuntime.rollback();
		assert.deepEqual([...views[0].root], ["preserve this node"]);
		assert(!revisions(clients[0].tree).includes(rolledBackRevision));
		assert.equal(
			historyStart(clients[0].tree, compressor(clients[0].runtime)),
			undefined,
			"The rolled-back optimistic change must not pin history",
		);

		views[0].root.insertAtEnd("after rollback");
		const retainedRevision = headRevision(clients[0].tree);
		synchronize();
		assert.deepEqual([...views[1].root], ["preserve this node", "after rollback"]);
		advanceWindow();
		for (const client of clients) {
			const loaded = await load(await summarize(client.tree), compressor(client.runtime));
			assert(!revisions(loaded.tree).includes(rolledBackRevision));
			assert(revisions(loaded.tree).includes(retainedRevision));
			assert.equal(historyStart(loaded.tree, compressor(loaded.runtime)), retainedRevision);
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
		assert.equal(historyStart(loaded.tree, compressor(loaded.runtime)), undefined);
	});

	it("restores the snapshot start before replaying trailing configuration changes", async () => {
		const { clients, views, synchronize, advanceWindow } = setup({ retainHistory: true });
		views[0].root.insertAtEnd("retained by the snapshot");
		synchronize();
		advanceWindow();
		const loaded = await load(
			await summarize(clients[0].tree),
			compressor(clients[0].runtime),
		);
		const initialStart = historyStart(loaded.tree, compressor(loaded.runtime));
		assert(initialStart !== undefined, "The snapshot has retained history");
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
					isChannelConfigurationOp: true,
					expectedRevision: 0,
					values: { retainHistory: true },
				},
				{ version: 1, isChannelConfigurationOp: true, expectedRevision: 1, values: {} },
				{
					version: 1,
					isChannelConfigurationOp: true,
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
		assert.equal(historyStart(loaded.tree, compressor(loaded.runtime)), undefined);
		const reloaded = await load(await summarize(loaded.tree), compressor(clients[0].runtime));
		assert.equal(historyStart(reloaded.tree, compressor(reloaded.runtime)), undefined);
		reloaded.tree.viewWith(viewConfiguration).root.insertAtEnd("after trailing configuration");
		const retainedEdit = headRevision(reloaded.tree);
		const edit = reloaded.submitted[0];
		deliverMessage(reloaded.delta, edit.contents, 101, true, edit.metadata);
		assert.equal(historyStart(reloaded.tree, compressor(reloaded.runtime)), retainedEdit);
	});

	it("resumes ordinary safe pruning after a loaded configuration-only disable", async () => {
		const { clients, views, synchronize, advanceWindow } = setup({ retainHistory: true });
		views[0].root.insertAtEnd("old archived edit");
		const oldEdit = headRevision(clients[0].tree);
		synchronize();
		advanceWindow();
		const summary = await summarize(clients[0].tree);
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
					contents: {
						version: 1,
						isChannelConfigurationOp: true,
						expectedRevision: 0,
						values: {},
					},
					clientSequenceNumber: 1,
					localOpMetadata: undefined,
				},
			],
		});
		assert.equal(historyStart(loaded.tree, compressor(loaded.runtime)), undefined);
		const view = loaded.tree.viewWith(viewConfiguration);
		view.root.insertAtEnd("advance the loaded collaboration window");
		const edit = loaded.submitted[0];
		deliverMessage(loaded.delta, edit.contents, 101, true, edit.metadata, 100);
		assert(
			!revisions(loaded.tree).includes(oldEdit),
			"Disabled history must be pruned when the collaboration window advances",
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
			const previousStart = historyStart(source.tree, compressor(source.runtime));
			await assert.rejects(
				configuration(source.tree).requestChange(invalidConfiguration),
				/Unsupported channel configuration values/,
			);
			assert.deepEqual(configuration(source.tree).current, previous);
			assert.equal(historyStart(source.tree, compressor(source.runtime)), previousStart);
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

	for (const [description, marker] of [
		["an invalid encoded revision", "invalid"],
		["the root revision", "root"],
		["a revision missing from the main trunk", Number.MAX_SAFE_INTEGER],
	] as const) {
		it(`rejects ${description} as the persisted history start`, async () => {
			const { tree, runtime } = detached({ retainHistory: true });
			const summary = await summarize(tree);
			const history = editManagerBlob(summary);
			assert.notEqual(history.historyStart, undefined);
			const indexes = summary.tree.indexes;
			assert(indexes?.type === SummaryType.Tree, "Expected the indexes summary");
			const editManager = indexes.tree.EditManager;
			assert(editManager?.type === SummaryType.Tree, "Expected the EditManager summary");
			const corrupt: ISummaryTree = {
				...summary,
				tree: {
					...summary.tree,
					indexes: {
						...indexes,
						tree: {
							...indexes.tree,
							EditManager: {
								...editManager,
								tree: {
									...editManager.tree,
									String: {
										type: SummaryType.Blob,
										content: JSON.stringify({ ...history, historyStart: marker }),
									},
								},
							},
						},
					},
				},
			};
			await assert.rejects(
				load(corrupt, compressor(runtime)),
				marker === "invalid"
					? /0xac1/ // Existing codec schema-validation error.
					: /History start must reference a retained main-trunk commit/,
			);
		});
	}

	for (const configured of [false, true]) {
		it(`rejects a retained start without ${configured ? "enabled retention" : "persisted configuration"}`, async () => {
			const source = detached({ retainHistory: true });
			const summary = await summarize(source.tree);
			assert.notEqual(editManagerBlob(summary).historyStart, undefined);
			const blob = summary.tree[".attributes"];
			assert(blob?.type === SummaryType.Blob, "Expected persisted channel attributes");
			assert.equal(typeof blob.content, "string");
			const attributes = JSON.parse(blob.content as string) as {
				configuration?: { values: Configuration };
			};
			if (configured) {
				assert(attributes.configuration !== undefined, "Expected persisted configuration");
				attributes.configuration.values = { retainHistory: false };
			} else {
				delete attributes.configuration;
			}
			const corrupt: ISummaryTree = {
				...summary,
				tree: {
					...summary.tree,
					".attributes": { type: SummaryType.Blob, content: JSON.stringify(attributes) },
				},
			};
			await assert.rejects(load(corrupt, compressor(source.runtime)), /history|History/);
		});
	}
});
