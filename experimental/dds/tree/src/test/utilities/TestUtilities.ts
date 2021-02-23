/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { v4 as uuidv4 } from 'uuid';
import { expect } from 'chai';
import { DataObject } from '@fluidframework/aqueduct';
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
import { ITelemetryBaseLogger } from '@fluidframework/common-definitions';
import { IContainer } from '@fluidframework/container-definitions';
import { Definition, EditId, NodeId, TraitLabel } from '../../Identifiers';
import { fail } from '../../Common';
import { ChangeNode, NodeData, TraitLocation } from '../../PersistedTypes';
import { SharedTree } from '../../SharedTree';
import { newEdit, setTrait } from '../../EditUtilities';
import { fullHistorySummarizer, SharedTreeSummarizer } from '../../Summary';
import { initialTree } from '../../InitialTree';
import { Snapshot } from '../../Snapshot';

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
	initialTree?: ChangeNode;
	/** If false, a MockContainerRuntimeFactory connected to the SharedTree will be returned. */
	localMode?: boolean;
	/**
	 * MockContainerRuntimeFactory to connect the SharedTree to. A new one will not be created if one is provided.
	 * If localMode is set to false, it will not be connected to the created SharedTree.
	 * */
	containerRuntimeFactory?: MockContainerRuntimeFactory;
	/**
	 * If not set, full history will be preserved.
	 */
	summarizer?: SharedTreeSummarizer;
	/**
	 * If set, uses the given id as the edit id for tree setup. Only has an effect if initialTree is also set.
	 */
	setupEditId?: EditId;

	/**
	 * Telemetry logger injected into the SharedTree.
	 */
	logger?: ITelemetryBaseLogger;
}

export const testTrait: TraitLocation = {
	parent: initialTree.identifier,
	label: 'e276f382-fa99-49a1-ae81-42001791c733' as TraitLabel,
};

/** Sets up and returns an object of components useful for testing SharedTree. */
export function setUpTestSharedTree(
	options: SharedTreeTestingOptions = { localMode: true }
): SharedTreeTestingComponents {
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
	const tree = new SharedTree(componentRuntime, id ?? 'testSharedTree', true);
	tree.summarizer = options.summarizer ?? fullHistorySummarizer;

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

class TestDataObject extends DataObject {
	public static readonly type = '@fluid-example/test-dataStore';
	public get _root() {
		return this.root;
	}
}

enum DataObjectFactoryType {
	Primed, // default
	Test,
}

/** Configuration used for the LocalTestObjectProvider created by setUpLocalServerTestSharedTree. */
export interface ITestContainerConfig {
	// TestFluidDataObject instead of PrimedDataStore
	fluidDataObjectType?: DataObjectFactoryType;

	// An array of channel name and DDS factory pairs to create on container creation time
	registry?: ChannelFactoryRegistry;
}

/** Objects returned by setUpLocalServerTestSharedTree */
export interface LocalServerSharedTreeTestingComponents {
	/** The LocalTestObjectProvider created if one was not set in the options. */
	localTestObjectProvider: TestObjectProvider<ITestContainerConfig>;
	/** The SharedTree created and set up. */
	tree: SharedTree;
}

/** Options used to customize setUpLocalServerTestSharedTree */
export interface LocalServerSharedTreeTestingOptions {
	/**
	 * Id for the SharedTree to be created.
	 * If two SharedTrees have the same id and the same localTestObjectProvider,
	 * they will collaborate (send edits to each other)
	 */
	id?: string;
	/** Node to initialize the SharedTree with. */
	initialTree?: ChangeNode;
	/** If set, uses the provider to create the container and create the SharedTree. */
	localTestObjectProvider?: TestObjectProvider<ITestContainerConfig>;
	/**
	 * If not set, full history will be preserved.
	 */
	summarizer?: SharedTreeSummarizer;
	/**
	 * If set, uses the given id as the edit id for tree setup. Only has an effect if initialTree is also set.
	 */
	setupEditId?: EditId;
}

/**
 * Sets up and returns an object of components useful for testing SharedTree with a local server.
 * Required for tests that involve the uploadBlob API
 */
export async function setUpLocalServerTestSharedTree(
	options: LocalServerSharedTreeTestingOptions
): Promise<LocalServerSharedTreeTestingComponents> {
	const { id, initialTree, localTestObjectProvider, setupEditId, summarizer } = options;

	const treeId = id || 'test';
	const registry: ChannelFactoryRegistry = [[treeId, SharedTree.getFactory()]];
	const runtimeFactory = (containerOptions?: ITestContainerConfig) =>
		new TestContainerRuntimeFactory(TestDataObject.type, new TestFluidObjectFactory(registry), {
			initialSummarizerDelayMs: 0,
		});

	let provider: TestObjectProvider<ITestContainerConfig>;
	let container: IContainer;

	if (localTestObjectProvider !== undefined) {
		provider = localTestObjectProvider;
		container = await provider.loadTestContainer();
	} else {
		provider = new TestObjectProvider(getFluidTestDriver(), runtimeFactory);
		container = await provider.makeTestContainer();
	}

	const dataObject = await requestFluidObject<ITestFluidObject>(container, 'default');
	const tree = await dataObject.getSharedObject<SharedTree>(treeId);

	if (initialTree !== undefined && localTestObjectProvider === null) {
		setTestTree(tree, initialTree, setupEditId);
	}

	if (summarizer !== undefined) {
		tree.summarizer = summarizer;
	}

	return { tree, localTestObjectProvider: provider };
}

/** Sets testTrait to contain `node`. */
export function setTestTree(tree: SharedTree, node: ChangeNode, overrideId?: EditId): EditId {
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

/** Asserts that changes to SharedTree in editor() function do not cause any observable state change */
export function assertNoDelta(tree: SharedTree, editor: () => void) {
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
