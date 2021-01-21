/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { v4 as uuidv4 } from 'uuid';
import {
	MockContainerRuntimeFactory,
	MockFluidDataStoreRuntime,
	MockStorage,
} from '@fluidframework/test-runtime-utils';
import { expect } from 'chai';
import { Definition, EditId, NodeId, TraitLabel } from '../../Identifiers';
import { ChangeNode, TraitLocation } from '../../PersistedTypes';
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

	const componentRuntime = new MockFluidDataStoreRuntime();
	// Enable expensiveValidation
	const tree = new SharedTree(componentRuntime, id || 'testSharedTree', true);
	tree.summarizer = options.summarizer ?? fullHistorySummarizer;

	const newContainerRuntimeFactory = containerRuntimeFactory || new MockContainerRuntimeFactory();

	if (localMode) {
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

/** Left node of 'simpleTestTree' */
export const left: ChangeNode = makeEmptyNode();

/** Right node of 'simpleTestTree' */
export const right: ChangeNode = makeEmptyNode();

/** Left node of 'simpleTestTree' */
export const leftConsistent: ChangeNode = makeEmptyNode('a083857d-a8e1-447a-ba7c-92fd0be9db2b' as NodeId);

/** Right node of 'simpleTestTree' */
export const rightConsistent: ChangeNode = makeEmptyNode('78849e85-cb7f-4b93-9fdc-18439c60fe30' as NodeId);

/** Label for the 'left' trait in 'simpleTestTree' */
export const leftTraitLabel = 'left' as TraitLabel;

/** Label for the 'right' trait in 'simpleTestTree' */
export const rightTraitLabel = 'right' as TraitLabel;

/** A simple, three node tree useful for testing. Contains one node under a 'left' trait and one under a 'right' trait. */
export const simpleTestTree: ChangeNode = {
	...makeEmptyNode(),
	traits: { [leftTraitLabel]: [left], [rightTraitLabel]: [right] },
};

/** A simple, three node tree useful for testing. Contains one node under a 'left' trait and one under a 'right' trait. */
export const simpleTestTreeConsistent: ChangeNode = {
	...makeEmptyNode('25de3875-9537-47ec-8699-8a85e772a509' as NodeId),
	traits: { [leftTraitLabel]: [leftConsistent], [rightTraitLabel]: [rightConsistent] },
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
