/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { memoizeGetter, fail, setPropertyIfDefined } from '../../Common';
import { BuildTreeNode } from '../../default-edits';
import { TraitLocation, TraitMap, TreeNode, Payload, ChangeNode, NodeIdContext } from '../../generic';
import { Definition, NodeId, StableNodeId, TraitLabel } from '../../Identifiers';
import { initialTree } from '../../InitialTree';
import { RevisionView } from '../../generic/TreeView';

/**
 * A node with no children
 */
export type LeafNode<T> = Omit<T, 'traits'> & { traits: Record<string, never> };

/**
 * An object containing useful properties for analyzing a node within a test context.
 */
export interface TestNode extends TreeNode<TestNode> {
	/** The label of the trait under which this node resides */
	traitLabel: TraitLabel;
	/** The trait location at which this node resides */
	traitLocation: TraitLocation;
	/** A revision view of this node */
	view: RevisionView;
}

/**
 * A small tree of `TestNode`s consisting of a root/parent node, a "left" child and a "right" child.
 */
export interface TestTree extends TestNode, NodeIdContext {
	/** The left child node */
	left: TestNode;
	/** The right child node */
	right: TestNode;
	/** Create an arbitrary unparented node with the given payload, if specified */
	buildLeaf(id?: undefined, payload?: Payload): LeafNode<Omit<BuildTreeNode, 'identifier'>>;
	/** Create an arbitrary unparented node with the given identifier and payload, if specified */
	buildLeaf(id: NodeId, payload?: Payload): LeafNode<ChangeNode>;
	/** Create an arbitrary unparented node with a new unique ID and the given payload, if specified */
	buildLeafWithId(payload?: Payload): LeafNode<ChangeNode>;
	/**
	 * Generates a leaf {@link ChangeNode}.
	 * If no `id` is explicitly provided, one will be generated.
	 * @param id - Explicit ID to use as the new node's identifier. If not provided, one will be generated.
	 */
	buildStableLeaf(id?: NodeId, payload?: Payload): LeafNode<ChangeNode>;
}

const testTraitLabel = 'e276f382-fa99-49a1-ae81-42001791c733' as TraitLabel;

/**
 * A TestTree for general use within the shared-tree package. The nodes in every `SimpleTestTree` will have unique identifiers - i.e. two
 * different instances of `SimpleTestTree` are never equivalent.
 */
export class SimpleTestTree implements TestTree {
	public static readonly definition = 'node' as Definition;
	public static readonly traitLabel = 'root' as TraitLabel;
	public static readonly leftTraitLabel = 'left' as TraitLabel;
	public static readonly rightTraitLabel = 'right' as TraitLabel;

	private readonly root: TestNode;
	public readonly left: TestNode;
	public readonly right: TestNode;
	public readonly expensiveValidation;

	public constructor(private readonly nodeIdContext: NodeIdContext, expensiveValidation = true) {
		const leftIdentifier = nodeIdContext.generateNodeId();
		const rightIdentifier = nodeIdContext.generateNodeId();
		const rootIdentifier = nodeIdContext.generateNodeId();
		this.expensiveValidation = expensiveValidation;
		this.left = {
			definition: SimpleTestTree.definition,
			identifier: leftIdentifier,
			traits: {},
			traitLabel: SimpleTestTree.leftTraitLabel,
			traitLocation: {
				parent: rootIdentifier,
				label: SimpleTestTree.leftTraitLabel,
			},
			get view() {
				return memoizeGetter(this, 'view', RevisionView.fromTree(this, expensiveValidation));
			},
		};
		this.right = {
			definition: SimpleTestTree.definition,
			identifier: rightIdentifier,
			traits: {},
			traitLabel: SimpleTestTree.rightTraitLabel,
			traitLocation: {
				parent: rootIdentifier,
				label: SimpleTestTree.rightTraitLabel,
			},
			get view() {
				return memoizeGetter(this, 'view', RevisionView.fromTree(this, expensiveValidation));
			},
		};
		const rootParent = initialTree.identifier;
		this.root = {
			definition: SimpleTestTree.definition,
			identifier: rootIdentifier,
			traits: {
				[SimpleTestTree.leftTraitLabel]: [this.left],
				[SimpleTestTree.rightTraitLabel]: [this.right],
			},
			traitLabel: testTraitLabel,
			traitLocation: {
				label: testTraitLabel,
				parent: rootParent,
			},
			get view() {
				return memoizeGetter(this, 'view', RevisionView.fromTree(this, expensiveValidation));
			},
		};
	}

	public get view(): RevisionView {
		return memoizeGetter(this, 'view', RevisionView.fromTree(this, this.expensiveValidation));
	}

	public get definition(): Definition {
		return this.root.definition;
	}

	public get identifier(): NodeId {
		return this.root.identifier;
	}

	public get traits(): TraitMap<TestNode> {
		return this.root.traits;
	}

	public get traitLabel(): TraitLabel {
		return this.root.traitLabel;
	}

	public get traitLocation(): TraitLocation {
		return this.root.traitLocation;
	}

	public buildLeaf(id?: undefined, payload?: Payload): LeafNode<BuildTreeNode>;

	public buildLeaf(id: NodeId, payload?: Payload): LeafNode<ChangeNode>;

	public buildLeaf(id?: NodeId, payload?: Payload): LeafNode<BuildTreeNode> | LeafNode<ChangeNode> {
		if (id === undefined) {
			return buildLeaf(undefined, payload);
		} else {
			return buildLeaf(id, payload);
		}
	}

	public buildLeafWithId(payload?: Payload): LeafNode<ChangeNode> {
		return this.buildLeaf(this.generateNodeId(), payload);
	}

	public buildStableLeaf(id?: NodeId, payload?: Payload): LeafNode<ChangeNode> {
		return buildStableLeaf(this, id, payload);
	}

	public generateNodeId(override?: string): NodeId {
		return this.nodeIdContext.generateNodeId(override);
	}

	public convertToStableNodeId(id: NodeId): StableNodeId {
		return this.nodeIdContext.convertToStableNodeId(id);
	}

	public tryConvertToStableNodeId(id: NodeId): StableNodeId | undefined {
		return this.nodeIdContext.tryConvertToStableNodeId(id);
	}

	public convertToNodeId(id: StableNodeId): NodeId {
		return this.nodeIdContext.convertToNodeId(id);
	}

	public tryConvertToNodeId(id: StableNodeId): NodeId | undefined {
		return this.nodeIdContext.tryConvertToNodeId(id);
	}
}

/** A TestTree which resets before each test */
export class RefreshingTestTree<T extends TestTree> implements TestTree {
	private _testTree?: T;

	public constructor(createTestTree: () => T, fn?: (testTree: T) => void) {
		beforeEach(() => {
			this._testTree = createTestTree();
			fn?.(this._testTree);
		});
		afterEach(() => {
			this._testTree = undefined;
		});
	}

	private get testTree(): T {
		return (
			this._testTree ??
			fail(
				'RefreshingTestTree should be created within a describe() block and should only be read within it() blocks'
			)
		);
	}

	public get left(): TestNode {
		return this.testTree.left;
	}

	public get right(): TestNode {
		return this.testTree.right;
	}

	public get definition(): Definition {
		return this.testTree.definition;
	}

	public get identifier(): NodeId {
		return this.testTree.identifier;
	}

	public get traits(): TraitMap<TestNode> {
		return this.testTree.traits;
	}

	public get traitLabel(): TraitLabel {
		return this.testTree.traitLabel;
	}

	public get traitLocation(): TraitLocation {
		return this.testTree.traitLocation;
	}

	public get view(): RevisionView {
		return this.testTree.view;
	}

	public buildLeaf(id?: undefined, payload?: Payload): LeafNode<BuildTreeNode>;
	public buildLeaf(id: NodeId, payload?: Payload): LeafNode<ChangeNode>;
	public buildLeaf(id?: NodeId, payload?: Payload): LeafNode<BuildTreeNode> | LeafNode<ChangeNode> {
		if (id === undefined) {
			return this.testTree.buildLeaf(undefined, payload);
		} else {
			return this.testTree.buildLeaf(id, payload);
		}
	}
	public buildLeafWithId(payload?: Payload): LeafNode<ChangeNode> {
		return this.testTree.buildLeafWithId(payload);
	}
	public buildStableLeaf(id?: NodeId, payload?: Payload): LeafNode<ChangeNode> {
		return this.testTree.buildStableLeaf(id, payload);
	}

	public generateNodeId(override?: string): NodeId {
		return this.testTree.generateNodeId(override);
	}

	convertToStableNodeId(id: NodeId): StableNodeId {
		return this.testTree.convertToStableNodeId(id);
	}

	tryConvertToStableNodeId(id: NodeId): StableNodeId | undefined {
		return this.testTree.convertToStableNodeId(id);
	}

	convertToNodeId(id: StableNodeId): NodeId {
		return this.testTree.convertToNodeId(id);
	}

	tryConvertToNodeId(id: StableNodeId): NodeId | undefined {
		return this.testTree.tryConvertToNodeId(id);
	}
}

/** Create a new node with an automatically generated ID and the given payload */
export function buildLeaf(id?: undefined, payload?: Payload): LeafNode<BuildTreeNode>;
/** Create a new node with the given ID and payload */
export function buildLeaf(id: NodeId, payload?: Payload): LeafNode<ChangeNode>;
/** Create a new node with the given ID and payload */
export function buildLeaf(id?: NodeId, payload?: Payload): LeafNode<BuildTreeNode> | LeafNode<ChangeNode> {
	const node: LeafNode<BuildTreeNode> = {
		definition: SimpleTestTree.definition,
		traits: {},
	};
	setPropertyIfDefined(id, node, 'identifier');
	setPropertyIfDefined(payload, node, 'payload');
	return node;
}

/**
 * Generates a leaf {@link ChangeNode}.
 * If no `id` is explicitly provided, one will be generated.
 * @param id - Explicit ID to use as the new node's identifier. If not provided, one will be generated.
 */
export function buildStableLeaf(nodeIdContext: NodeIdContext, id?: NodeId, payload?: Payload): LeafNode<ChangeNode> {
	return {
		...buildLeaf(undefined, payload),
		identifier: nodeIdContext.convertToStableNodeId(id ?? nodeIdContext.generateNodeId()),
	};
}
