/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { v4 as uuidv4, v5 as uuidv5 } from 'uuid';
import { expect } from 'chai';
import { Container, Loader } from '@fluidframework/container-loader';
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
} from '@fluidframework/test-utils';
import { LocalServerTestDriver } from '@fluidframework/test-drivers';
import { ITelemetryBaseLogger } from '@fluidframework/common-definitions';
import { Definition, DetachedSequenceId, EditId, NodeId, TraitLabel } from '../../Identifiers';
import { compareArrays, comparePayloads, fail } from '../../Common';
import { initialTree } from '../../InitialTree';
import { Snapshot } from '../../Snapshot';
import { SharedTree, Change, setTrait, SharedTreeFactory, StablePlace } from '../../default-edits';
import {
	ChangeNode,
	Edit,
	GenericSharedTree,
	newEdit,
	NodeData,
	SharedTreeDiagnosticEvent,
	SharedTreeSummaryWriteFormat,
	TraitLocation,
} from '../../generic';
import { SharedTreeWithAnchors, SharedTreeWithAnchorsFactory } from '../../anchored-edits';

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
	 * If set, uses the given id as the edit id for tree setup. Only has an effect if initialTree is also set.
	 */
	setupEditId?: EditId;

	/**
	 * Telemetry logger injected into the SharedTree.
	 */
	logger?: ITelemetryBaseLogger;
}

/** Left node of 'simpleTestTree' */
export const left: ChangeNode = makeEmptyNode('a083857d-a8e1-447a-ba7c-92fd0be9db2b' as NodeId);

/** Right node of 'simpleTestTree' */
export const right: ChangeNode = makeEmptyNode('78849e85-cb7f-4b93-9fdc-18439c60fe30' as NodeId);

/** Label for the 'left' trait in 'simpleTestTree' */
export const leftTraitLabel = 'left' as TraitLabel;

/** Label for the 'right' trait in 'simpleTestTree' */
export const rightTraitLabel = 'right' as TraitLabel;

/** A simple, three node tree useful for testing. Contains one node under a 'left' trait and one under a 'right' trait. */
export const simpleTestTree: ChangeNode = {
	...makeEmptyNode('25de3875-9537-47ec-8699-8a85e772a509' as NodeId),
	traits: { [leftTraitLabel]: [left], [rightTraitLabel]: [right] },
};

/** Convenient pre-made TraitLocation for the left trait of 'simpleTestTree'. */
export const leftTraitLocation = {
	parent: simpleTestTree.identifier,
	label: leftTraitLabel,
};

/** Convenient pre-made TraitLocation for the right trait of 'simpleTestTree'. */
export const rightTraitLocation = {
	parent: simpleTestTree.identifier,
	label: rightTraitLabel,
};

/** Convenient pre-made Snapshot for 'simpleTestTree'. */
export const simpleTreeSnapshot = Snapshot.fromTree(simpleTestTree);

/** Convenient pre-made Snapshot for 'initialTree'. */
export const initialSnapshot = Snapshot.fromTree(initialTree);

/**
 * Convenient pre-made Snapshot for 'simpleTestTree'.
 * Expensive validation is turned on for this snapshot, and it should not be used for performance testing.
 */
export const simpleTreeSnapshotWithValidation = Snapshot.fromTree(simpleTestTree, true);

/**
 * Convenient pre-made Snapshot for 'initialTree'.
 * Expensive validation is turned on for this snapshot, and it should not be used for performance testing.
 */
export const initialSnapshotWithValidation = Snapshot.fromTree(initialTree, true);

export const testTrait: TraitLocation = {
	parent: initialSnapshot.root,
	label: 'e276f382-fa99-49a1-ae81-42001791c733' as TraitLabel,
};

/** Sets up and returns an object of components useful for testing SharedTree. */
export function setUpTestSharedTree(options?: SharedTreeTestingOptions): SharedTreeTestingComponents {
	return setUpTestSharedTreeGeneric(SharedTree.getFactory, options);
}

/** Sets up and returns an object of components useful for testing SharedTreeWithAnchors. */
export function setUpTestSharedTreeWithAnchors(
	options?: SharedTreeTestingOptions
): SharedTreeTestingComponents<SharedTreeWithAnchors> {
	return setUpTestSharedTreeGeneric(SharedTreeWithAnchors.getFactory, options);
}

function setUpTestSharedTreeGeneric<
	TSharedTree extends SharedTree | SharedTreeWithAnchors,
	TSharedTreeFactory extends SharedTreeFactory | SharedTreeWithAnchorsFactory
>(
	factoryGetter: (summarizeHistory?: boolean) => TSharedTreeFactory,
	options: SharedTreeTestingOptions = { localMode: true }
): SharedTreeTestingComponents<TSharedTree> {
	const { id, initialTree, localMode, containerRuntimeFactory, setupEditId } = options;
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
	const factory = factoryGetter(options.summarizeHistory);
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

/**
 * Sets up and returns an object of components useful for testing SharedTree with a local server.
 * Required for tests that involve the uploadBlob API.
 *
 * If using this method, be sure to clean up server state by calling `reset` on the TestObjectProvider.
 */
export async function setUpLocalServerTestSharedTree(
	options: LocalServerSharedTreeTestingOptions
): Promise<LocalServerSharedTreeTestingComponents> {
	return setUpLocalServerTestSharedTreeGeneric(SharedTree.getFactory, options);
}

/**
 * Sets up and returns an object of components useful for testing SharedTreeWithAnchors with a local server.
 * Required for tests that involve the uploadBlob API.
 *
 * If using this method, be sure to clean up server state by calling `reset` on the TestObjectProvider.
 */
export async function setUpLocalServerTestSharedTreeWithAnchors(
	options: LocalServerSharedTreeTestingOptions
): Promise<LocalServerSharedTreeTestingComponents<SharedTreeWithAnchors>> {
	return setUpLocalServerTestSharedTreeGeneric(SharedTreeWithAnchors.getFactory, options);
}

async function setUpLocalServerTestSharedTreeGeneric<
	TSharedTree extends SharedTree | SharedTreeWithAnchors,
	TSharedTreeFactory extends SharedTreeFactory | SharedTreeWithAnchorsFactory
>(
	factoryGetter: (
		summarizeHistory?: boolean,
		uploadEditChunks?: boolean,
		writeSummaryFormat?: SharedTreeSummaryWriteFormat
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
				summarizeHistory,
				uploadEditChunks === undefined ? true : uploadEditChunks,
				writeSummaryFormat
			),
		],
	];
	const runtimeFactory = () =>
		new TestContainerRuntimeFactory(TestDataStoreType, new TestFluidObjectFactory(registry), {
			addGlobalAgentSchedulerAndLeaderElection: false,
			summaryOptions: { initialSummarizerDelayMs: 0 },
		});

	let provider: TestObjectProvider;
	let container: Container;

	if (testObjectProvider !== undefined) {
		provider = testObjectProvider;
		container = await provider.loadTestContainer();
	} else {
		const driver = new LocalServerTestDriver();
		provider = new TestObjectProvider(Loader, driver, runtimeFactory);
		container = (await provider.makeTestContainer()) as Container;
	}

	const dataObject = await requestFluidObject<ITestFluidObject>(container, 'default');
	const tree = await dataObject.getSharedObject<TSharedTree>(treeId);

	if (initialTree !== undefined && testObjectProvider === undefined) {
		setTestTree(tree, initialTree, setupEditId);
	}

	return { tree, testObjectProvider: provider };
}

/** Sets testTrait to contain `node`. */
export function setTestTree<TExtraChangeTypes = never>(
	tree: GenericSharedTree<TExtraChangeTypes | Change>,
	node: ChangeNode,
	overrideId?: EditId
): EditId {
	const edit = newEdit(setTrait(testTrait, [node]));
	tree.processLocalEdit({ ...edit, id: overrideId || edit.id });
	return overrideId || edit.id;
}

/** Creates an empty node for testing purposes. */
export function makeEmptyNode(identifier: NodeId = uuidv4() as NodeId): ChangeNode {
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

	// First edit is an insert
	const nodeId = 'ae6b24eb-6fa8-42cc-abd2-48f250b7798f' as NodeId;
	const node = makeEmptyNode(nodeId);
	const firstEdit = newEdit([
		Change.build([node], 0 as DetachedSequenceId),
		Change.insert(0 as DetachedSequenceId, StablePlace.before(left)),
	]);

	const edits: Edit<Change>[] = [];
	edits.push({ ...firstEdit, id: uuidv5('test', uuidNamespace) as EditId });

	// Every subsequent edit is a set payload
	for (let i = 1; i < numberOfEdits - 1; i++) {
		const edit = newEdit([Change.setPayload(nodeId, i)]);
		edits.push({ ...edit, id: uuidv5(i.toString(), uuidNamespace) as EditId });
	}

	return edits;
}

/** Asserts that changes to SharedTree in editor() function do not cause any observable state change */
export function assertNoDelta<TChange>(tree: GenericSharedTree<TChange>, editor: () => void) {
	const snapshotA = tree.currentView;
	editor();
	const snapshotB = tree.currentView;
	const delta = snapshotA.delta(snapshotB);
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
	let errorMessage;

	try {
		await asyncFunction();
	} catch (error) {
		errorMessage = error.message;
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

/**
 * Check if two trees are equivalent, meaning they have the same descendants with the same properties.
 *
 * See {@link comparePayloads} for payload comparison semantics.
 */
export function deepCompareNodes(a: ChangeNode, b: ChangeNode): boolean {
	if (a.identifier !== b.identifier) {
		return false;
	}

	if (a.definition !== b.definition) {
		return false;
	}

	if (!comparePayloads(a.payload, b.payload)) {
		return false;
	}

	const traitsA = Object.entries(a.traits);
	const traitsB = Object.entries(b.traits);

	if (traitsA.length !== traitsB.length) {
		return false;
	}

	for (const [traitLabel, childrenA] of traitsA) {
		const childrenB = b.traits[traitLabel];

		if (childrenA.length !== childrenB.length) {
			return false;
		}

		const traitsEqual = compareArrays(childrenA, childrenB, (childA, childB) => {
			if (typeof childA === 'number' || typeof childB === 'number') {
				// Check if children are DetachedSequenceIds
				return childA === childB;
			}

			return deepCompareNodes(childA, childB);
		});

		if (!traitsEqual) {
			return false;
		}
	}

	return true;
}
