/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { resolve } from 'path';
import { assert } from '@fluidframework/core-utils';
import { v5 as uuidv5 } from 'uuid';
import { expect } from 'chai';
import { LocalServerTestDriver } from '@fluid-private/test-drivers';
import { SummaryCollection, DefaultSummaryConfiguration } from '@fluidframework/container-runtime';
import { IContainerExperimental, Loader, waitContainerToCatchUp } from '@fluidframework/container-loader';
import {
	MockContainerRuntimeFactory,
	MockFluidDataStoreRuntime,
	MockStorage,
} from '@fluidframework/test-runtime-utils';
import {
	ChannelFactoryRegistry,
	ITestFluidObject,
	TestObjectProvider,
	TestContainerRuntimeFactory,
	TestFluidObjectFactory,
	createAndAttachContainer,
	ITestObjectProvider,
} from '@fluidframework/test-utils';
import type { IContainer, IHostLoader } from '@fluidframework/container-definitions';
import type {
	ConfigTypes,
	IConfigProviderBase,
	IFluidCodeDetails,
	IFluidHandle,
	IRequestHeader,
} from '@fluidframework/core-interfaces';
import { ISequencedDocumentMessage } from '@fluidframework/protocol-definitions';
import { createChildLogger } from '@fluidframework/telemetry-utils';
import { ITelemetryBaseLogger } from '@fluidframework/core-interfaces';
import {
	AttributionId,
	DetachedSequenceId,
	EditId,
	NodeId,
	OpSpaceNodeId,
	SessionId,
	StableNodeId,
} from '../../Identifiers';
import { fail, identity, ReplaceRecursive } from '../../Common';
import { IdCompressor } from '../../id-compressor';
import { createSessionId } from '../../id-compressor/NumericUuid';
import { getChangeNodeFromViewNode } from '../../SerializationUtilities';
import { initialTree } from '../../InitialTree';
import {
	ChangeInternal,
	Edit,
	NodeData,
	Payload,
	reservedIdCount,
	SharedTreeOp,
	SharedTreeOp_0_0_2,
	WriteFormat,
} from '../../persisted-types';
import { TraitLocation, TreeView } from '../../TreeView';
import { SharedTreeDiagnosticEvent } from '../../EventTypes';
import { getNodeId, getNodeIdContext, NodeIdContext, NodeIdConverter, NodeIdNormalizer } from '../../NodeIdUtilities';
import { newEdit, setTrait } from '../../EditUtilities';
import { SharedTree, SharedTreeFactory, SharedTreeOptions_0_0_2 } from '../../SharedTree';
import { BuildNode, Change, StablePlace } from '../../ChangeTypes';
import { convertEditIds } from '../../IdConversion';
import { OrderedEditSet } from '../../EditLog';
import { buildLeaf, RefreshingTestTree, SimpleTestTree, TestTree } from './TestNode';

/** Objects returned by setUpTestSharedTree */
export interface SharedTreeTestingComponents {
	/** The MockFluidDataStoreRuntime used to created the SharedTree. */
	componentRuntime: MockFluidDataStoreRuntime;
	/**
	 * The MockContainerRuntimeFactory created if one was not provided in the options.
	 * Only connected to the SharedTree if the localMode option was set to false.
	 * */
	containerRuntimeFactory: MockContainerRuntimeFactory;
	/** The SharedTree created and set up. */
	tree: SharedTree;
}

/** Options used to customize setUpTestSharedTree */
export interface SharedTreeTestingOptions {
	/**
	 * Id for the SharedTree to be created.
	 * If two SharedTrees have the same id and the same containerRuntimeFactory,
	 * they will collaborate (send edits to each other)
	 */
	id?: string;
	/** Node to initialize the SharedTree with. */
	initialTree?: BuildNode;
	/** If false, a MockContainerRuntimeFactory connected to the SharedTree will be returned. */
	localMode?: boolean;
	/**
	 * MockContainerRuntimeFactory to connect the SharedTree to. A new one will not be created if one is provided.
	 * If localMode is set to true, it will not be connected to the created SharedTree.
	 * */
	containerRuntimeFactory?: MockContainerRuntimeFactory;
	/** Iff true, do not `fail` on invalid edits */
	allowInvalid?: boolean;
	/** Iff true, do not `fail` on malformed edits */
	allowMalformed?: boolean;
	/** Unless set to true, a SharedTree error causes the test to fail */
	noFailOnError?: boolean;
	/**
	 * If not set, full history will be preserved.
	 */
	summarizeHistory?: boolean;
	/**
	 * If not set, summaries will be written in format 0.1.1.
	 */
	writeFormat?: WriteFormat;
	/**
	 * Optional attribution ID to give to the new tree
	 */
	attributionId?: AttributionId;
	/**
	 * If set, uses the given id as the edit id for tree setup. Only has an effect if initialTree is also set.
	 */
	setupEditId?: EditId;

	/**
	 * Telemetry logger injected into the SharedTree.
	 */
	logger?: ITelemetryBaseLogger;
}

export const testTraitLabel = SimpleTestTree.traitLabel;
export function testTrait(view: TreeView): TraitLocation {
	return {
		label: testTraitLabel,
		parent: view.root,
	};
}

/** Sets up and returns an object of components useful for testing SharedTree. */
export function setUpTestSharedTree(
	options: SharedTreeTestingOptions = { localMode: true }
): SharedTreeTestingComponents {
	const {
		id,
		initialTree,
		localMode,
		containerRuntimeFactory,
		setupEditId,
		summarizeHistory,
		writeFormat,
		attributionId,
	} = options;
	let componentRuntime: MockFluidDataStoreRuntime;
	if (options.logger) {
		const proxyHandler: ProxyHandler<MockFluidDataStoreRuntime> = {
			get: (target, prop, receiver) => {
				if (prop === 'logger' && options.logger) {
					return options.logger;
				}
				return target[prop as keyof MockFluidDataStoreRuntime];
			},
		};
		componentRuntime = new Proxy(new MockFluidDataStoreRuntime(), proxyHandler);
	} else {
		componentRuntime = new MockFluidDataStoreRuntime();
	}

	// Enable expensiveValidation
	let factory: SharedTreeFactory;
	if (writeFormat === WriteFormat.v0_0_2) {
		const options: SharedTreeOptions_0_0_2 = { summarizeHistory: summarizeHistory ?? true };
		factory = SharedTree.getFactory(writeFormat, options);
	} else {
		const options = {
			summarizeHistory: summarizeHistory ?? true ? { uploadEditChunks: true } : false,
			attributionId,
		};
		factory = SharedTree.getFactory(writeFormat ?? WriteFormat.v0_1_1, options);
	}
	const tree = factory.create(componentRuntime, id ?? 'testSharedTree');

	if (options.allowInvalid === undefined || !options.allowInvalid) {
		tree.on(SharedTreeDiagnosticEvent.DroppedInvalidEdit, () => fail('unexpected invalid edit'));
	}

	if (options.allowMalformed === undefined || !options.allowMalformed) {
		tree.on(SharedTreeDiagnosticEvent.DroppedMalformedEdit, () => fail('unexpected malformed edit'));
	}

	if (options.noFailOnError === undefined || !options.noFailOnError) {
		// any errors thrown by a SharedObject event listener will be caught and
		// reemitted on this event.  For testing purposes, rethrow so that it
		// actually causes the test to fail.
		tree.on('error', (error) => {
			throw error;
		});
	}

	const newContainerRuntimeFactory = containerRuntimeFactory ?? new MockContainerRuntimeFactory();

	if (localMode === true) {
		componentRuntime.local = true;
	} else {
		const containerRuntime = newContainerRuntimeFactory.createContainerRuntime(componentRuntime);
		const services = {
			deltaConnection: componentRuntime.createDeltaConnection(),
			objectStorage: new MockStorage(undefined),
		};
		tree.connect(services);
	}

	if (initialTree !== undefined) {
		setTestTree(tree, initialTree, setupEditId);
	}

	return {
		componentRuntime,
		containerRuntimeFactory: newContainerRuntimeFactory,
		tree,
	};
}

const TestDataStoreType = '@fluid-example/test-dataStore';

/** Objects returned by setUpLocalServerTestSharedTree */
export interface LocalServerSharedTreeTestingComponents {
	/** The testObjectProvider created if one was not set in the options. */
	testObjectProvider: TestObjectProvider;
	/** The SharedTree created and set up. */
	tree: SharedTree;
	/** The container created and set up. */
	container: IContainer;
	/** Handles to any blobs uploaded via `blobs` */
	uploadedBlobs: IFluidHandle<ArrayBufferLike>[];
}

/** Options used to customize setUpLocalServerTestSharedTree */
export interface LocalServerSharedTreeTestingOptions {
	/** Contents of blobs that should be uploaded to the runtime upon creation. Handles to these blobs will be returned. */
	blobs?: ArrayBufferLike[];
	/** Headers to include on the container load request. */
	headers?: IRequestHeader;
	/**
	 * Id for the SharedTree to be created.
	 * If two SharedTrees have the same id and the same testObjectProvider,
	 * they will collaborate (send edits to each other)
	 */
	id?: string;
	/** Node to initialize the SharedTree with. */
	initialTree?: BuildNode;
	/** If set, uses the provider to create the container and create the SharedTree. */
	testObjectProvider?: TestObjectProvider;
	/**
	 * If not set, full history will be preserved.
	 */
	summarizeHistory?: boolean;
	/**
	 * If not set, summaries will be written in format 0.0.2.
	 */
	writeFormat?: WriteFormat;
	/**
	 * Optional attribution ID to give to the new tree
	 */
	attributionId?: AttributionId;
	/**
	 * If not set, will upload edit chunks when they are full.
	 */
	uploadEditChunks?: boolean;
	/**
	 * If set, uses the given id as the edit id for tree setup. Only has an effect if initialTree is also set.
	 */
	setupEditId?: EditId;
	/**
	 * If set, will be passed to the container on load
	 */
	pendingLocalState?: string;
	/**
	 * If set, will be added to the configProvider object passed to the loader
	 * and will take effect for the duration of its lifetime
	 */
	featureGates?: Record<string, ConfigTypes>;
}

const testObjectProviders: TestObjectProvider[] = [];
afterEach(() => {
	for (const provider of testObjectProviders) {
		provider.reset();
	}
	testObjectProviders.length = 0;
});

/**
 * Sets up and returns an object of components useful for testing SharedTree with a local server.
 * Required for tests that involve the uploadBlob API.
 *
 * Any TestObjectProvider created by this function will be reset after the test completes (via afterEach) hook.
 */
export async function setUpLocalServerTestSharedTree(
	options: LocalServerSharedTreeTestingOptions
): Promise<LocalServerSharedTreeTestingComponents> {
	const {
		blobs,
		headers,
		id,
		initialTree,
		testObjectProvider,
		setupEditId,
		summarizeHistory,
		writeFormat,
		uploadEditChunks,
		attributionId,
		pendingLocalState,
	} = options;

	const featureGates = options.featureGates ?? {};
	featureGates['Fluid.Container.enableOfflineLoad'] = true;
	featureGates['Fluid.ContainerRuntime.DisablePartialFlush'] = true;

	const treeId = id ?? 'test';
	let factory: SharedTreeFactory;
	if (writeFormat === WriteFormat.v0_0_2) {
		const options: SharedTreeOptions_0_0_2 = { summarizeHistory: summarizeHistory ?? true };
		factory = SharedTree.getFactory(writeFormat, options);
	} else {
		const options = {
			summarizeHistory: summarizeHistory ?? true ? { uploadEditChunks: uploadEditChunks ?? true } : false,
			attributionId,
		};
		factory = SharedTree.getFactory(writeFormat ?? WriteFormat.v0_1_1, options);
	}
	const registry: ChannelFactoryRegistry = [[treeId, factory]];

	const runtimeFactory = () =>
		new TestContainerRuntimeFactory(TestDataStoreType, new TestFluidObjectFactory(registry), {
			summaryOptions: {
				summaryConfigOverrides: {
					...DefaultSummaryConfiguration,
					...{
						minIdleTime: 1000, // Manually set idle times so some SharedTree tests don't timeout.
						maxIdleTime: 1000,
						maxTime: 1000 * 12,
						initialSummarizerDelayMs: 0,
					},
				},
			},
		});

	const defaultCodeDetails: IFluidCodeDetails = {
		package: 'defaultTestPackage',
		config: {},
	};

	function makeTestLoader(provider: TestObjectProvider): IHostLoader {
		const fluidEntryPoint = runtimeFactory();
		const configProvider = (settings: Record<string, ConfigTypes>): IConfigProviderBase => ({
			getRawConfig: (name: string): ConfigTypes => settings[name],
		});

		return provider.createLoader([[defaultCodeDetails, fluidEntryPoint]], {
			options: { maxClientLeaveWaitTime: 1000 },
			configProvider: configProvider(featureGates),
		});
	}

	let provider: TestObjectProvider;
	let container: IContainer;

	if (testObjectProvider !== undefined) {
		provider = testObjectProvider;
		const driver = new LocalServerTestDriver();
		const loader = makeTestLoader(provider);
		// Once ILoaderOptions is specificable, this should use `provider.loadTestContainer` instead.
		container = await loader.resolve({ url: await driver.createContainerUrl(treeId), headers }, pendingLocalState);
		await waitContainerToCatchUp(container);
	} else {
		const driver = new LocalServerTestDriver();
		provider = new TestObjectProvider(Loader, driver, runtimeFactory);
		testObjectProviders.push(provider);
		// Once ILoaderOptions is specificable, this should use `provider.makeTestContainer` instead.
		const loader = makeTestLoader(provider);
		container = await createAndAttachContainer(defaultCodeDetails, loader, driver.createCreateNewRequest(treeId));
	}

	const dataObject = (await container.getEntryPoint()) as ITestFluidObject;

	const uploadedBlobs =
		blobs === undefined ? [] : await Promise.all(blobs.map(async (blob) => dataObject.context.uploadBlob(blob)));
	const tree = await dataObject.getSharedObject<SharedTree>(treeId);

	if (initialTree !== undefined && testObjectProvider === undefined) {
		setTestTree(tree, initialTree, setupEditId);
	}

	return { container, tree, testObjectProvider: provider, uploadedBlobs };
}

/** Sets testTrait to contain `node`. */
function setTestTree(tree: SharedTree, node: BuildNode, overrideId?: EditId): EditId {
	const trait = testTrait(tree.currentView);
	if (overrideId === undefined) {
		return tree.applyEdit(...setTrait(trait, node)).id;
	} else {
		const changes = setTrait(trait, node).map((c) => tree.internalizeChange(c));
		return tree.applyEditInternal({ changes, id: overrideId }).id;
	}
}

/**
 * Creates a list of edits with stable IDs that can be processed by a SharedTree.
 * @returns the list of created edits
 */
export function createStableEdits(
	numberOfEdits: number,
	idContext: NodeIdContext = makeNodeIdContext(),
	payload: (i: number) => Payload = identity
): Edit<ChangeInternal>[] {
	if (numberOfEdits === 0) {
		return [];
	}

	const uuidNamespace = '44864298-500e-4cf8-9f44-a249e5b3a286';
	const nodeId = idContext.generateNodeId('ae6b24eb-6fa8-42cc-abd2-48f250b7798f');
	const node = buildLeaf(nodeId);
	const insertEmptyNode = newEdit([
		ChangeInternal.build([node], 0 as DetachedSequenceId),
		ChangeInternal.insert(
			0 as DetachedSequenceId,
			StablePlace.atEndOf({ label: testTraitLabel, parent: idContext.convertToNodeId(initialTree.identifier) })
		),
	]);

	const edits: Edit<ChangeInternal>[] = [{ ...insertEmptyNode, id: uuidv5('test', uuidNamespace) as EditId }];

	// Every subsequent edit is a set payload
	for (let i = 1; i < numberOfEdits; i++) {
		const edit = newEdit([ChangeInternal.setPayload(nodeId, payload(i))]);
		edits.push({ ...edit, id: uuidv5(i.toString(), uuidNamespace) as EditId });
	}

	return edits;
}

/** Asserts that changes to SharedTree in editor() function do not cause any observable state change */
export function assertNoDelta(tree: SharedTree, editor: () => void) {
	const viewA = tree.currentView;
	editor();
	const viewB = tree.currentView;
	const delta = viewA.delta(viewB);
	expect(delta).deep.equals({
		changed: [],
		added: [],
		removed: [],
	});
}

/**
 * Used to test error throwing in async functions.
 */
export async function asyncFunctionThrowsCorrectly(
	asyncFunction: () => Promise<unknown>,
	expectedError: string
): Promise<boolean> {
	let errorMessage: string | undefined;

	try {
		await asyncFunction();
	} catch (error) {
		errorMessage = (error as Error).message;
	}

	return errorMessage === expectedError;
}

/**
 * Returns true if two nodes have equivalent data, otherwise false.
 * Does not compare children or payloads.
 * @param nodes - two or more nodes to compare
 */
export function areNodesEquivalent(...nodes: NodeData<unknown>[]): boolean {
	if (nodes.length < 2) {
		fail('Too few nodes to compare');
	}

	for (let i = 1; i < nodes.length; i++) {
		if (nodes[i].definition !== nodes[0].definition) {
			return false;
		}

		if (nodes[i].identifier !== nodes[0].identifier) {
			return false;
		}
	}

	return true;
}

// This accounts for this file being executed after compilation. If many tests want to leverage resources, we should unify
// resource path logic to a single place.
export const testDocumentsPathBase = resolve(__dirname, '../../../src/test/documents/');

export const versionComparator = (versionA: string, versionB: string): number => {
	const versionASplit = versionA.split('.');
	const versionBSplit = versionB.split('.');

	assert(
		versionASplit.length === versionBSplit.length && versionASplit.length === 3,
		0x668 /* Version numbers should follow semantic versioning. */
	);

	for (let i = 0; i < 3; ++i) {
		const numberA = parseInt(versionASplit[i], 10);
		const numberB = parseInt(versionBSplit[i], 10);

		if (numberA > numberB) {
			return 1;
		}

		if (numberA < numberB) {
			return -1;
		}
	}

	return 0;
};

/**
 * Create a {@link SimpleTestTree} from the given {@link SharedTree} or {@link IdCompressor}
 */
export function setUpTestTree(idSource?: IdCompressor | SharedTree, expensiveValidation = false): TestTree {
	const source = idSource ?? new IdCompressor(createSessionId(), reservedIdCount);
	if (source instanceof SharedTree) {
		assert(source.edits.length === 0, 0x669 /* tree must be a new SharedTree */);
		const getNormalizer = () => getIdNormalizerFromSharedTree(source);
		const contextWrapper = {
			normalizeToOpSpace: (id: NodeId) => getNormalizer().normalizeToOpSpace(id),
			normalizeToSessionSpace: (id: OpSpaceNodeId, sessionId: SessionId) =>
				getNormalizer().normalizeToSessionSpace(id, sessionId),
			get localSessionId() {
				return getNormalizer().localSessionId;
			},
		};
		const simpleTestTree = new SimpleTestTree(source, contextWrapper, expensiveValidation);
		setTestTree(source, simpleTestTree);
		return simpleTestTree;
	}

	const context = makeNodeIdContext(source);
	return new SimpleTestTree(context, context, expensiveValidation);
}

/**
 * Gets an id normalizer from the provided shared-tree. This is
 */
export function getIdNormalizerFromSharedTree(sharedTree: SharedTree): NodeIdNormalizer<OpSpaceNodeId> {
	return (
		((sharedTree as any).idNormalizer as NodeIdNormalizer<OpSpaceNodeId>) ??
		fail('Failed to find SharedTree normalizer')
	);
}

/**
 * Create a {@link SimpleTestTree} before each test
 */
export function refreshTestTree(
	idSourceFactory?: (() => IdCompressor) | (() => SharedTree),
	fn?: (testTree: TestTree) => void,
	expensiveValidation = false
): TestTree {
	const factory = idSourceFactory ?? (() => new IdCompressor(createSessionId(), reservedIdCount));
	return new RefreshingTestTree(() => {
		return setUpTestTree(factory(), expensiveValidation);
	}, fn);
}

export function makeNodeIdContext(idCompressor?: IdCompressor): NodeIdContext & NodeIdNormalizer<OpSpaceNodeId> {
	const compressor = idCompressor ?? new IdCompressor(createSessionId(), reservedIdCount);
	return getNodeIdContext(compressor);
}

/**
 * Applies an arbitrary edit to the given SharedTree which leaves the tree in the same state that it was before the edit.
 * This is useful for test scenarios that want to apply edits but don't care what they do.
 */
export function applyNoop(tree: SharedTree): Edit<unknown> {
	return tree.applyEdit(...noopEdit(tree.currentView));
}

/**
 * Creates an arbitrary edit which leaves a tree in the same state that it was before the edit.
 * This is useful for test scenarios that want to create edits but don't care what they do.
 */
export function noopEdit(view: TreeView): Change[] {
	const traitLocation = testTrait(view);
	const trait = view.getTrait(traitLocation);
	// Set the test trait to the same thing that it already was
	return setTrait(
		traitLocation,
		trait.map((id) => getChangeNodeFromViewNode(view, id))
	);
}

/** Translate an ID in one context to an ID in another */
export function translateId(id: NodeId | NodeData<NodeId>, from: NodeIdConverter, to: NodeIdConverter): NodeId {
	return to.convertToNodeId(from.convertToStableNodeId(getNodeId(id)));
}

export function normalizeId(tree: SharedTree, id: NodeId): OpSpaceNodeId {
	const normalizer = getIdNormalizerFromSharedTree(tree);
	return normalizer.normalizeToOpSpace(id);
}

export function normalizeIds(tree: SharedTree, ...ids: NodeId[]): OpSpaceNodeId[] {
	const normalizer = getIdNormalizerFromSharedTree(tree);
	return ids.map((id) => normalizer.normalizeToOpSpace(id));
}

export function idsAreEqual(treeA: SharedTree, idsA: NodeId[], treeB: SharedTree, idsB: NodeId[]): boolean {
	if (idsA.length !== idsB.length) {
		return false;
	}
	const contextA = getIdNormalizerFromSharedTree(treeA);
	const contextB = getIdNormalizerFromSharedTree(treeB);
	for (let i = 0; i < idsA.length; i++) {
		if (contextA.normalizeToOpSpace(idsA[i]) !== contextB.normalizeToOpSpace(idsB[i])) {
			return false;
		}
	}
	return true;
}

export function normalizeEdit(
	tree: SharedTree,
	edit: Edit<ChangeInternal>
): Edit<ReplaceRecursive<ChangeInternal, NodeId, OpSpaceNodeId>> {
	const context = getIdNormalizerFromSharedTree(tree);
	return convertEditIds(edit, (id) => context.normalizeToOpSpace(id));
}

export function stabilizeEdit(
	tree: SharedTree,
	edit: Edit<ChangeInternal>
): Edit<ReplaceRecursive<ChangeInternal, NodeId, StableNodeId>> {
	return convertEditIds(edit, (id) => tree.convertToStableNodeId(id));
}

export function getEditLogInternal(tree: SharedTree): OrderedEditSet<ChangeInternal> {
	return tree.edits as unknown as OrderedEditSet<ChangeInternal>;
}

/**
 * Spies on all future ops submitted to `containerRuntimeFactory`. When ops are submitted, they will be `push`ed into the
 * returned array.
 */
export function spyOnSubmittedOps<Op extends SharedTreeOp | SharedTreeOp_0_0_2>(
	containerRuntimeFactory: MockContainerRuntimeFactory
): Op[] {
	const ops: Op[] = [];
	const originalPush = containerRuntimeFactory.pushMessage.bind(containerRuntimeFactory);
	containerRuntimeFactory.pushMessage = (message: Partial<ISequencedDocumentMessage>) => {
		const { contents } = message;
		ops.push(contents as Op);
		originalPush(message);
	};
	return ops;
}

/**
 * Waits for summarization to occur, and returns a version that can be passed into newly loaded containers
 * to ensure they load this summary version. Use the `LoaderHeader.version` header.
 */
export async function waitForSummary(mainContainer: IContainer): Promise<string> {
	const { deltaManager } = mainContainer;
	const summaryCollection = new SummaryCollection(deltaManager, createChildLogger());
	const ackedSummary = await summaryCollection.waitSummaryAck(deltaManager.lastSequenceNumber);
	return ackedSummary.summaryAck.contents.handle;
}

/**
 * Runs an action while the given container has been paused
 */
export async function withContainerOffline<TReturn>(
	provider: ITestObjectProvider,
	container: IContainerExperimental,
	action: () => TReturn
): Promise<{ actionReturn: TReturn; pendingLocalState: string }> {
	await provider.ensureSynchronized();
	await provider.opProcessingController.pauseProcessing(container);
	const actionReturn = action();
	const pendingLocalState = await container.closeAndGetPendingLocalState?.();
	assert(pendingLocalState !== undefined, 0x726 /* pendingLocalState should be defined */);
	return { actionReturn, pendingLocalState };
}
