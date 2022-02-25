/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import * as fs from 'fs';
import { resolve, join } from 'path';
import { v4 as uuidv4, v4, v5 as uuidv5 } from 'uuid';
import { expect } from 'chai';
import { Container, Loader, waitContainerToCatchUp } from '@fluidframework/container-loader';
import { requestFluidObject } from '@fluidframework/runtime-utils';
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
	// KLUDGE:#62681: Remove eslint ignore due to unresolved import false positive
} from '@fluidframework/test-utils'; // eslint-disable-line import/no-unresolved
import { LocalServerTestDriver } from '@fluidframework/test-drivers';
import { ITelemetryBaseLogger } from '@fluidframework/common-definitions';
import { assert } from '@fluidframework/common-utils';
import type { IHostLoader } from '@fluidframework/container-definitions';
import type { IFluidCodeDetails } from '@fluidframework/core-interfaces';
import { Definition, DetachedSequenceId, EditId, NodeId, StableNodeId, TraitLabel } from '../../Identifiers';
import { assertNotUndefined, fail } from '../../Common';
import { initialTree } from '../../InitialTree';
import { SharedTree, Change, setTrait, SharedTreeFactory, StablePlace, ChangeInternal } from '../../default-edits';
import {
	ChangeNode,
	Edit,
	GenericSharedTree,
	getUploadedEditChunkContents,
	newEdit,
	NodeData,
	NodeIdContext,
	RevisionView,
	SharedTreeDiagnosticEvent,
	SharedTreeSummaryWriteFormat,
	TraitLocation,
	TreeView,
} from '../../generic';
import { EditLog } from '../../EditLog';
import { IdCompressor } from '../../id-compressor';
import { createSessionId } from '../../id-compressor/NumericUuid';
import { reservedIdCount } from '../../generic/GenericSharedTree';
import { getChangeNodeFromView, getChangeNodeFromViewNode } from '../../SerializationUtilities';
import { RefreshingTestTree, SimpleTestTree, TestTree } from './TestNode';

/** Objects returned by setUpTestSharedTree */
export interface SharedTreeTestingComponents<TSharedTree = SharedTree> {
	/** The MockFluidDataStoreRuntime used to created the SharedTree. */
	componentRuntime: MockFluidDataStoreRuntime;
	/**
	 * The MockContainerRuntimeFactory created if one was not provided in the options.
	 * Only connected to the SharedTree if the localMode option was set to false.
	 * */
	containerRuntimeFactory: MockContainerRuntimeFactory;
	/** The SharedTree created and set up. */
	tree: TSharedTree;
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
	initialTree?: ChangeNode;
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
	 * If not set, summaries will be written in format 0.0.2.
	 */
	writeSummaryFormat?: SharedTreeSummaryWriteFormat;
	/**
	 * If set, uses the given id as the edit id for tree setup. Only has an effect if initialTree is also set.
	 */
	setupEditId?: EditId;

	/**
	 * Telemetry logger injected into the SharedTree.
	 */
	logger?: ITelemetryBaseLogger;
}

/**
 * Left node of {@link simpleTestTree}
 *
 * @deprecated Use {@link SimpleTestTree.left} instead.
 */
export const left: ChangeNode = makeEmptyNode('a083857d-a8e1-447a-ba7c-92fd0be9db2b' as NodeId);

/**
 * Right node of {@link simpleTestTree}
 *
 * @deprecated Use {@link SimpleTestTree.right} instead.
 */
export const right: ChangeNode = makeEmptyNode('78849e85-cb7f-4b93-9fdc-18439c60fe30' as NodeId);

/**
 * Label for the 'left' trait in {@link simpleTestTree}
 *
 * @deprecated Use {@link SimpleTestTree.left}'s {@link TestNode.traitLabel} instead.
 */
export const leftTraitLabel = 'left' as TraitLabel;

/**
 * Label for the 'right' trait in {@link simpleTestTree}
 *
 * @deprecated Use {@link SimpleTestTree.right}'s {@link TestNode.traitLabel} instead.
 */
export const rightTraitLabel = 'right' as TraitLabel;

/**
 * NodeId for the root node of {@link simpleTestTree}
 *
 * @deprecated Use {@link SimpleTestTree} instead.
 */
export const rootNodeId = '25de3875-9537-47ec-8699-8a85e772a509' as NodeId;

/**
 * A simple, three node tree useful for testing. Contains one node under a 'left' trait and one under a 'right' trait.
 *
 * @deprecated Use {@link SimpleTestTree} instead.
 */
export const simpleTestTree: ChangeNode = {
	...makeEmptyNode(rootNodeId),
	traits: { [leftTraitLabel]: [left], [rightTraitLabel]: [right] },
};

/**
 * Convenient pre-made TraitLocation for the left trait of 'simpleTestTree'.
 *
 * @deprecated Use {@link SimpleTestTree.left}'s {@link TestNode.traitLocation} instead.
 */
export const leftTraitLocation = {
	parent: simpleTestTree.identifier,
	label: leftTraitLabel,
};

/**
 * Convenient pre-made TraitLocation for the right trait of 'simpleTestTree'.
 *
 * @deprecated Use {@link SimpleTestTree.right}'s {@link TestNode.traitLocation} instead.
 */
export const rightTraitLocation = {
	parent: simpleTestTree.identifier,
	label: rightTraitLabel,
};

/**
 * Convenient pre-made RevisionView for 'simpleTestTree'.
 *
 * @deprecated Use {@link SimpleTestTree.view} instead.
 */
export const simpleRevisionView = RevisionView.fromTree(simpleTestTree);

/**
 * Convenient pre-made RevisionView for 'initialTree'.
 */
export const initialRevisionView = RevisionView.fromTree(initialTree);

/**
 * Convenient pre-made RevisionView for 'simpleTestTree'.
 * Expensive validation is turned on for this view, and it should not be used for performance testing.
 *
 * @deprecated Construct a {@link RevisionView} from a non-static tree.
 */
export const simpleRevisionViewWithValidation = RevisionView.fromTree(simpleTestTree, true);

/**
 * Convenient pre-made RevisionView for 'initialTree'.
 * Expensive validation is turned on for this view, and it should not be used for performance testing.
 */
export const initialRevisionViewWithValidation = RevisionView.fromTree(initialTree, true);

export const testTraitLabel = SimpleTestTree.traitLabel;
export function testTrait(view: TreeView): TraitLocation {
	return {
		label: testTraitLabel,
		parent: view.root,
	};
}

/** Sets up and returns an object of components useful for testing SharedTree. */
export function setUpTestSharedTree(options?: SharedTreeTestingOptions): SharedTreeTestingComponents {
	return setUpTestSharedTreeGeneric(SharedTree.getFactory, options);
}

/** Sets up and returns an object of components useful for testing a GenericSharedTree. */
function setUpTestSharedTreeGeneric<TSharedTree extends SharedTree, TSharedTreeFactory extends SharedTreeFactory>(
	factoryGetter: (
		summarizeHistory?: boolean,
		writeSummaryFormat?: SharedTreeSummaryWriteFormat
	) => TSharedTreeFactory,
	options: SharedTreeTestingOptions = { localMode: true }
): SharedTreeTestingComponents<TSharedTree> {
	const { id, initialTree, localMode, containerRuntimeFactory, setupEditId, summarizeHistory, writeSummaryFormat } =
		options;
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
	const factory = factoryGetter(summarizeHistory === undefined ? true : summarizeHistory, writeSummaryFormat);
	const tree = factory.create(componentRuntime, id === undefined ? 'testSharedTree' : id, true) as TSharedTree;

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

	const newContainerRuntimeFactory = containerRuntimeFactory || new MockContainerRuntimeFactory();

	if (localMode === true) {
		componentRuntime.local = true;
	} else {
		const containerRuntime = newContainerRuntimeFactory.createContainerRuntime(componentRuntime);
		const services = {
			deltaConnection: containerRuntime.createDeltaConnection(),
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
export interface LocalServerSharedTreeTestingComponents<TSharedTree = SharedTree> {
	/** The testObjectProvider created if one was not set in the options. */
	testObjectProvider: TestObjectProvider;
	/** The SharedTree created and set up. */
	tree: TSharedTree;
	/** The container created and set up. */
	container: Container;
}

/** Options used to customize setUpLocalServerTestSharedTree */
export interface LocalServerSharedTreeTestingOptions {
	/**
	 * Id for the SharedTree to be created.
	 * If two SharedTrees have the same id and the same testObjectProvider,
	 * they will collaborate (send edits to each other)
	 */
	id?: string;
	/** Node to initialize the SharedTree with. */
	initialTree?: ChangeNode;
	/** If set, uses the provider to create the container and create the SharedTree. */
	testObjectProvider?: TestObjectProvider;
	/**
	 * If not set, full history will be preserved.
	 */
	summarizeHistory?: boolean;
	/**
	 * If not set, summaries will be written in format 0.0.2.
	 */
	writeSummaryFormat?: SharedTreeSummaryWriteFormat;
	/**
	 * If not set, will upload edit chunks when they are full.
	 */
	uploadEditChunks?: boolean;
	/**
	 * If set, uses the given id as the edit id for tree setup. Only has an effect if initialTree is also set.
	 */
	setupEditId?: EditId;
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
	return setUpLocalServerTestSharedTreeGeneric(SharedTree.getFactory, options);
}

/**
 * Sets up and returns an object of components useful for testing a GenericSharedTree with a local server.
 * Required for tests that involve the uploadBlob API.
 *
 * Any TestObjectProvider created by this function will be reset after the test completes (via afterEach) hook.
 */
async function setUpLocalServerTestSharedTreeGeneric<
	TSharedTree extends SharedTree,
	TSharedTreeFactory extends SharedTreeFactory
>(
	factoryGetter: (
		summarizeHistory?: boolean,
		writeSummaryFormat?: SharedTreeSummaryWriteFormat,
		uploadEditChunks?: boolean
	) => TSharedTreeFactory,
	options: LocalServerSharedTreeTestingOptions
): Promise<LocalServerSharedTreeTestingComponents<TSharedTree>> {
	const { id, initialTree, testObjectProvider, setupEditId, summarizeHistory, writeSummaryFormat, uploadEditChunks } =
		options;

	const treeId = id ?? 'test';
	const registry: ChannelFactoryRegistry = [
		[
			treeId,
			factoryGetter(
				summarizeHistory === undefined ? true : summarizeHistory,
				writeSummaryFormat,
				uploadEditChunks === undefined ? true : uploadEditChunks
			),
		],
	];
	const runtimeFactory = () =>
		new TestContainerRuntimeFactory(TestDataStoreType, new TestFluidObjectFactory(registry), {
			summaryOptions: { initialSummarizerDelayMs: 0 },
		});

	const defaultCodeDetails: IFluidCodeDetails = {
		package: 'defaultTestPackage',
		config: {},
	};

	function makeTestLoader(provider: TestObjectProvider): IHostLoader {
		const fluidEntryPoint = runtimeFactory();
		return provider.createLoader([[defaultCodeDetails, fluidEntryPoint]], { maxClientLeaveWaitTime: 1000 });
	}

	let provider: TestObjectProvider;
	let container: Container;

	if (testObjectProvider !== undefined) {
		provider = testObjectProvider;
		const driver = new LocalServerTestDriver();
		const loader = makeTestLoader(provider);
		// Once ILoaderOptions is specificable, this should use `provider.loadTestContainer` instead.
		container = (await loader.resolve({ url: await driver.createContainerUrl(treeId) })) as Container;
		await waitContainerToCatchUp(container);
	} else {
		const driver = new LocalServerTestDriver();
		provider = new TestObjectProvider(Loader, driver, runtimeFactory);
		testObjectProviders.push(provider);
		// Once ILoaderOptions is specificable, this should use `provider.makeTestContainer` instead.
		const loader = makeTestLoader(provider);
		container = (await createAndAttachContainer(
			defaultCodeDetails,
			loader,
			driver.createCreateNewRequest(treeId)
		)) as Container;
	}

	const dataObject = await requestFluidObject<ITestFluidObject>(container, 'default');
	const tree = await dataObject.getSharedObject<TSharedTree>(treeId);

	if (initialTree !== undefined && testObjectProvider === undefined) {
		setTestTree(tree, initialTree, setupEditId);
	}

	return { container, tree, testObjectProvider: provider };
}

/** Sets testTrait to contain `node`. */
function setTestTree(tree: SharedTree, node: ChangeNode, overrideId?: EditId): EditId {
	if (overrideId === undefined) {
		return tree.applyEdit(...setTrait(testTrait(tree.currentView), [node])).id;
	} else {
		const changes = setTrait(testTrait(tree.currentView), [node]).map((c) => tree.internalizeChange(c));
		return tree.applyEditInternal({ changes, id: overrideId }).id;
	}
}

/**
 * Creates an empty node for testing purposes.
 *
 * @deprecated Use {@link SimpleTestTree.buildLeaf} instead.
 */
export function makeEmptyNode(
	identifier: NodeId = uuidv4() as NodeId
): Omit<ChangeNode, 'traits'> & { traits: Record<string, never> } {
	const definition = 'node' as Definition;
	return { definition, identifier, traits: {} };
}

/** Creates a node with two children, one under a 'left' trait and one under a 'right' trait */
export function makeTestNode(identifier: NodeId = uuidv4() as NodeId): ChangeNode {
	const definition = 'node' as Definition;
	const left: ChangeNode = makeEmptyNode('c4acaed2-afac-417e-a3d7-07ea73c0330a' as NodeId);
	const right: ChangeNode = makeEmptyNode('452c618a-ba0c-4d9b-89f3-2248d27f8c7f' as NodeId);
	const leftTraitLabel = 'left' as TraitLabel;
	const rightTraitLabel = 'right' as TraitLabel;
	return {
		definition,
		identifier,
		traits: { [leftTraitLabel]: [left], [rightTraitLabel]: [right] },
	};
}

/**
 * Creates a list of edits with stable IDs that can be processed by a SharedTree.
 * @param numberOfEdits - the number of edits to create
 * @returns the list of created edits
 */
export function createStableEdits(numberOfEdits: number): Edit<Change>[] {
	if (numberOfEdits === 0) {
		return [];
	}

	const uuidNamespace = '44864298-500e-4cf8-9f44-a249e5b3a286';

	// First edit sets the test tree
	const edit = newEdit(setTrait({ label: testTraitLabel, parent: initialTree.identifier }, [simpleTestTree]));

	const nodeId = 'ae6b24eb-6fa8-42cc-abd2-48f250b7798f' as NodeId;
	const node = makeEmptyNode(nodeId);
	const insertEmptyNode = newEdit([
		Change.build([node], 0 as DetachedSequenceId),
		Change.insert(0 as DetachedSequenceId, StablePlace.before(left)),
	]);

	const edits: Edit<Change>[] = [{ changes: edit.changes, id: '5a17f20a-0567-41d4-90bb-fcc381d23f05' as EditId }];
	edits.push({ ...insertEmptyNode, id: uuidv5('test', uuidNamespace) as EditId });

	// Every subsequent edit is a set payload
	for (let i = 1; i < numberOfEdits - 1; i++) {
		const edit = newEdit([Change.setPayload(nodeId, i)]);
		edits.push({ ...edit, id: uuidv5(i.toString(), uuidNamespace) as EditId });
	}

	return edits;
}

/** Asserts that changes to SharedTree in editor() function do not cause any observable state change */
export function assertNoDelta(tree: GenericSharedTree<any, any, any>, editor: () => void) {
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

/*
 * Returns true if two nodes have equivalent data, otherwise false.
 * Does not compare children or payloads.
 * @param nodes - two or more nodes to compare
 */
export function areNodesEquivalent(...nodes: NodeData[]): boolean {
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

/** ID used by summary compatibility tests to set up trees. */
export const summaryCompatibilityTestSetupEditId = '9406d301-7449-48a5-b2ea-9be637b0c6e4' as EditId;

export function getDocumentFiles(document: string): {
	summaryByVersion: Map<string, string>;
	noHistorySummaryByVersion: Map<string, string>;
	denormalizedSummaryByVersion: Map<string, Map<string, string>>;
	denormalizedHistoryByType: Map<string, string>;
	blobsByVersion: Map<string, string>;
	history: Edit<ChangeInternal>[];
	changeNode: ChangeNode;
	sortedVersions: string[];
} {
	// Cache the contents of the relevant files here to avoid loading more than once.
	// Map containing summary file contents, keys are summary versions, values have file contents
	const summaryByVersion = new Map<string, string>();
	const noHistorySummaryByVersion = new Map<string, string>();

	// Denormalized files are indicated with ending suffixes that describe the type of denormalization.
	// For each version key, this maps has a mapping from each type to its corresponding file.
	// This allows us to test multiple types of denormalization on the same document type and version.
	const denormalizedSummaryByVersion = new Map<string, Map<string, string>>();

	// Map containing denormalized history files by type of denormalization.
	const denormalizedHistoryByType = new Map<string, string>();

	// Files of uploaded edit blob contents for summaries that support blobs.
	const blobsByVersion = new Map<string, string>();

	let historyOrUndefined: Edit<ChangeInternal>[] | undefined;
	let changeNodeOrUndefined: ChangeNode | undefined;

	const documentFiles = fs.readdirSync(join(testDocumentsPathBase, document));
	for (const documentFile of documentFiles) {
		const summaryFileRegex = /^summary-(?<version>\d+\.\d\.\d).json/;
		const match = summaryFileRegex.exec(documentFile);

		const denormalizedSummaryFileRegex = /summary-(?<version>\d+\.\d\.\d)-(?<type>[a-z-]+[a-z]+).json/;
		const denormalizedSummaryMatch = denormalizedSummaryFileRegex.exec(documentFile);

		const denormalizedHistoryFileRegex = /history-(?<type>[a-z-]+[a-z]+).json/;
		const denormalizedHistoryMatch = denormalizedHistoryFileRegex.exec(documentFile);

		const noHistorySummaryFileRegex = /^no-history-summary-(?<version>\d+\.\d\.\d).json/;
		const noHistoryMatch = noHistorySummaryFileRegex.exec(documentFile);

		const blobFileRegex = /blobs-(?<version>\d+\.\d\.\d).json/;
		const blobsMatch = blobFileRegex.exec(documentFile);

		const filePath = join(testDocumentsPathBase, document, documentFile);
		const file = fs.readFileSync(filePath, 'utf8');

		if (match && match.groups) {
			summaryByVersion.set(match.groups.version, file);
		} else if (denormalizedSummaryMatch && denormalizedSummaryMatch.groups) {
			const typesByVersion = denormalizedSummaryByVersion.get(denormalizedSummaryMatch.groups.version);
			if (typesByVersion !== undefined) {
				typesByVersion.set(denormalizedSummaryMatch.groups.type, file);
			} else {
				denormalizedSummaryByVersion.set(
					denormalizedSummaryMatch.groups.version,
					new Map<string, string>().set(denormalizedSummaryMatch.groups.type, file)
				);
			}
		} else if (denormalizedHistoryMatch && denormalizedHistoryMatch.groups) {
			denormalizedHistoryByType.set(denormalizedHistoryMatch.groups.type, file);
		} else if (noHistoryMatch && noHistoryMatch.groups) {
			noHistorySummaryByVersion.set(noHistoryMatch.groups.version, file);
		} else if (blobsMatch && blobsMatch.groups) {
			blobsByVersion.set(blobsMatch.groups.version, file);
		} else if (documentFile === 'history.json') {
			historyOrUndefined = JSON.parse(file);
		} else if (documentFile === 'change-node.json') {
			changeNodeOrUndefined = JSON.parse(file);
		}
	}

	const history = assertNotUndefined(historyOrUndefined);
	const changeNode = assertNotUndefined(changeNodeOrUndefined);
	const sortedVersions = Array.from(summaryByVersion.keys()).sort(versionComparator);

	return {
		summaryByVersion,
		noHistorySummaryByVersion,
		denormalizedSummaryByVersion,
		denormalizedHistoryByType,
		blobsByVersion,
		history,
		changeNode,
		sortedVersions,
	};
}

/** Helper utility used to generate test documents based on a given history. */
export async function createDocumentFiles(document: string, history: Edit<ChangeInternal>[]) {
	const directory = join(testDocumentsPathBase, document);
	try {
		fs.accessSync(directory);
	} catch {
		fs.mkdirSync(directory);
	}

	const writeFormats = [SharedTreeSummaryWriteFormat.Format_0_0_2, SharedTreeSummaryWriteFormat.Format_0_1_1];

	fs.writeFileSync(join(directory, 'history.json'), JSON.stringify(history));

	// Load the history into the tree and save the change node
	const { tree, testObjectProvider } = await setUpLocalServerTestSharedTree({
		setupEditId: summaryCompatibilityTestSetupEditId,
	});

	for (const edit of history) {
		tree.applyEditInternal(edit);
	}

	await testObjectProvider.ensureSynchronized();
	fs.writeFileSync(join(directory, 'change-node.json'), JSON.stringify(getChangeNodeFromView(tree.currentView)));

	const summary = tree.saveSummary();
	// Write summaries for each of the write formats supported. Each summary is taken after loading in the summary of the earliest supported write format.
	for (const format of writeFormats) {
		const { tree: tree2, testObjectProvider: testObjectProvider2 } = await setUpLocalServerTestSharedTree({
			setupEditId: summaryCompatibilityTestSetupEditId,
			writeSummaryFormat: format,
		});

		tree2.loadSummary(summary);
		await testObjectProvider2.ensureSynchronized();

		// Write full history summary
		fs.writeFileSync(join(directory, `summary-${format}.json`), tree2.saveSerializedSummary());

		// Write blob file
		assert(tree2.edits instanceof EditLog, 'EditLog must support summaries');
		const blobs = await getUploadedEditChunkContents(tree2);
		if (blobs.length > 0) {
			fs.writeFileSync(join(directory, `blobs-${format}.json`), JSON.stringify(blobs));
		}

		// Write no history summary
		const { tree: tree3, testObjectProvider: testObjectProvider3 } = await setUpLocalServerTestSharedTree({
			setupEditId: summaryCompatibilityTestSetupEditId,
			summarizeHistory: false,
			writeSummaryFormat: format,
		});

		tree3.loadSummary(summary);
		await testObjectProvider3.ensureSynchronized();
		fs.writeFileSync(join(directory, `no-history-summary-${format}.json`), tree3.saveSerializedSummary());
	}
}

const versionComparator = (versionA: string, versionB: string): number => {
	const versionASplit = versionA.split('.');
	const versionBSplit = versionB.split('.');

	assert(
		versionASplit.length === versionBSplit.length && versionASplit.length === 3,
		'Version numbers should follow semantic versioning.'
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
		assert(source.edits.length === 0, 'tree must be a new SharedTree');
		const simpleTestTree = new SimpleTestTree(source, expensiveValidation);
		setTestTree(source, simpleTestTree);
		return simpleTestTree;
	}

	if (source instanceof IdCompressor) {
		return new SimpleTestTree(makeTestNodeContext(source), expensiveValidation);
	}

	return new SimpleTestTree(source, expensiveValidation);
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

function makeTestNodeContext(_idCompressor?: IdCompressor): NodeIdContext {
	// TODO:#70358: Use IdCompressor
	// const compressor = idCompressor ?? new IdCompressor(createSessionId(), reservedIdCount);
	return {
		generateNodeId: (_override?: string) => v4() as NodeId,
		convertToNodeId: (id: StableNodeId) => id,
		tryConvertToNodeId: (id: StableNodeId) => id,
		convertToStableNodeId: (id: NodeId) => id,
		tryConvertToStableNodeId: (id: NodeId) => id,
	};
}

/**
 * Applies an arbitrary edit to the given SharedTree which leaves the tree in the same state that it was before the edit.
 * This is useful for test scenarios that want to apply edits but don't care what they do.
 */
export function applyNoop(tree: SharedTree): Edit<ChangeInternal> {
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
