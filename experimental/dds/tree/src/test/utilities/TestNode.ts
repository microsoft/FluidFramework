/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { BuildTreeNode } from '../../ChangeTypes.js';
import { fail, identity, memoizeGetter, setPropertyIfDefined } from '../../Common.js';
import { convertTreeNodes } from '../../EditUtilities.js';
import { convertNodeDataIds } from '../../IdConversion.js';
import { Definition, NodeId, OpSpaceNodeId, SessionId, StableNodeId, TraitLabel } from '../../Identifiers.js';
import { initialTree } from '../../InitialTree.js';
import { NodeIdContext, NodeIdConverter, NodeIdNormalizer } from '../../NodeIdUtilities.js';
import { RevisionView } from '../../RevisionView.js';
import { TraitLocation } from '../../TreeView.js';
import {
	BuildNodeInternal,
	ChangeNode,
	Payload,
	TraitLocationInternal,
	TraitLocationInternal_0_0_2,
	TraitMap,
	TreeNode,
} from '../../persisted-types/index.js';

/** A legacy format of a `TestNode` */
export type TestNode_0_0_2 = TreeNode<TestNode_0_0_2, StableNodeId>;

/**
 * A node with no children
 */
export type LeafNode<T> = Omit<T, 'traits'> & { traits: Record<string, never> };

/**
 * Test extension of {@link TraitLocation} which can be converted to stable or legacy formats
 */
export interface TestTraitLocation extends TraitLocation {
	stable: TraitLocationInternal_0_0_2;
	/** Translate this location into the equivalent location in another ID context */
	translate(idConverter: NodeIdConverter): TestTraitLocation;
}

/**
 * An object containing useful properties for analyzing a node within a test context.
 */
export interface TestNode extends TreeNode<TestNode, NodeId> {
	/** The label of the trait under which this node resides */
	traitLabel: TraitLabel;
	/** The trait location at which this node resides */
	traitLocation: TestTraitLocation;
	/** A revision view of this node */
	view: RevisionView;
	/** A version of this tree with stable IDs */
	stable: TestNode_0_0_2;
	/** Translate this node's ID into the equivalent ID in another ID context */
	translateId(idConverter: NodeIdConverter): NodeId;
	/** Express this tree as a ChangeNode */
	toChangeNode(): ChangeNode;
}

/**
 * A small tree of `TestNode`s consisting of a root/parent node, a "left" child and a "right" child. This is a useful tree for initializing
 * tests as it makes it ergonomic to retrieve various properties of the tree. Note that it only represents the initial state of the tree,
 * it does not update even if the SharedTree that it was the initial state for is mutated.
 */
export interface TestTree extends TestNode, NodeIdContext, NodeIdNormalizer<OpSpaceNodeId> {
	/** The left child node */
	left: TestNode;
	/** The right child node */
	right: TestNode;
	/** Create an arbitrary unparented node with the given payload, if specified */
	buildLeaf(id?: undefined, payload?: Payload): LeafNode<BuildTreeNode>;
	/** Create an arbitrary unparented node with the given identifier and payload, if specified */
	buildLeaf(id: NodeId, payload?: Payload): LeafNode<ChangeNode>;
	/**
	 * Generates a leaf node for use in internal build changes.
	 * If no `id` is explicitly provided, one will be generated.
	 * @param id - Explicit ID to use as the new node's identifier. If not provided, one will be generated.
	 */
	buildLeafInternal(id?: NodeId, payload?: Payload): LeafNode<TreeNode<BuildNodeInternal, NodeId>>;
}

/**
 * A TestTree for general use within the shared-tree package. The nodes in every `SimpleTestTree` will have unique identifiers - i.e. two
 * different instances of `SimpleTestTree` are never equivalent.
 */
export class SimpleTestTree implements TestTree {
	public static readonly definition = 'node' as Definition;
	public static readonly traitLabel = 'e276f382-fa99-49a1-ae81-42001791c733' as TraitLabel;
	public static readonly leftTraitLabel = 'left' as TraitLabel;
	public static readonly rightTraitLabel = 'right' as TraitLabel;

	private readonly root: TestNode;
	public readonly left: TestNode;
	public readonly right: TestNode;
	public readonly expensiveValidation;

	public constructor(
		private readonly nodeIdContext: NodeIdContext,
		private readonly nodeIdNormalizer: NodeIdNormalizer<OpSpaceNodeId>,
		expensiveValidation = true
	) {
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
				get stable() {
					return memoizeGetter(this, 'stable', convertToTraitLocation_0_0_2(this, nodeIdContext));
				},
				translate: (idConverter: NodeIdConverter) =>
					translateTraitLocation(SimpleTestTree.leftTraitLabel, rootIdentifier, nodeIdContext, idConverter),
			},
			get view() {
				return memoizeGetter(this, 'view', RevisionView.fromTree(this, expensiveValidation));
			},
			get stable() {
				return memoizeGetter(this, 'stable', convertToTestNode_0_0_2(this, nodeIdContext));
			},
			translateId: (idConverter: NodeIdConverter) => translateId(leftIdentifier, nodeIdContext, idConverter),
			toChangeNode: () =>
				convertTreeNodes<ChangeNode, ChangeNode>(this.left, (node) => convertNodeDataIds(node, identity)),
		};
		this.right = {
			definition: SimpleTestTree.definition,
			identifier: rightIdentifier,
			traits: {},
			traitLabel: SimpleTestTree.rightTraitLabel,
			traitLocation: {
				parent: rootIdentifier,
				label: SimpleTestTree.rightTraitLabel,
				get stable() {
					return memoizeGetter(this, 'stable', convertToTraitLocation_0_0_2(this, nodeIdContext));
				},
				translate: (idConverter: NodeIdConverter) =>
					translateTraitLocation(SimpleTestTree.rightTraitLabel, rootIdentifier, nodeIdContext, idConverter),
			},
			get view() {
				return memoizeGetter(this, 'view', RevisionView.fromTree(this, expensiveValidation));
			},
			get stable() {
				return memoizeGetter(this, 'stable', convertToTestNode_0_0_2(this, nodeIdContext));
			},
			translateId: (idConverter: NodeIdConverter) => translateId(rightIdentifier, nodeIdContext, idConverter),
			toChangeNode: () =>
				convertTreeNodes<ChangeNode, ChangeNode>(this.right, (node) => convertNodeDataIds(node, identity)),
		};
		const rootParent = nodeIdContext.convertToNodeId(initialTree.identifier);
		this.root = {
			definition: SimpleTestTree.definition,
			identifier: rootIdentifier,
			traits: {
				[SimpleTestTree.leftTraitLabel]: [this.left],
				[SimpleTestTree.rightTraitLabel]: [this.right],
			},
			traitLabel: SimpleTestTree.traitLabel,
			traitLocation: {
				label: SimpleTestTree.traitLabel,
				parent: rootParent,
				get stable() {
					return memoizeGetter(this, 'stable', convertToTraitLocation_0_0_2(this, nodeIdContext));
				},
				translate: (idConverter: NodeIdConverter) =>
					translateTraitLocation(SimpleTestTree.traitLabel, rootParent, nodeIdContext, idConverter),
			},
			get view() {
				return memoizeGetter(this, 'view', RevisionView.fromTree(this, expensiveValidation));
			},
			get stable() {
				return memoizeGetter(this, 'stable', convertToTestNode_0_0_2(this, nodeIdContext));
			},
			translateId: (idConverter: NodeIdConverter) => translateId(rootIdentifier, nodeIdContext, idConverter),
			toChangeNode: () =>
				convertTreeNodes<ChangeNode, ChangeNode>(this.root, (node) => convertNodeDataIds(node, identity)),
		};
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

	public get traitLocation(): TestTraitLocation {
		return this.root.traitLocation;
	}

	public get view(): RevisionView {
		return this.root.view;
	}

	public get stable() {
		return this.root.stable;
	}

	public translateId(idConverter: NodeIdConverter): NodeId {
		return this.root.translateId(idConverter);
	}

	public toChangeNode(): ChangeNode {
		return convertTreeNodes<ChangeNode, ChangeNode>(this, (node) => convertNodeDataIds(node, identity));
	}

	public buildLeaf(id?: undefined, payload?: Payload): LeafNode<BuildTreeNode>;

	public buildLeaf(id: NodeId, payload?: Payload): LeafNode<ChangeNode>;

	public buildLeaf(id?: NodeId, payload?: Payload): LeafNode<BuildTreeNode> | LeafNode<ChangeNode> {
		return id === undefined ? buildLeaf(undefined, payload) : buildLeaf(id, payload);
	}

	public buildLeafInternal(id?: NodeId, payload?: Payload): LeafNode<TreeNode<BuildNodeInternal, NodeId>> {
		return buildLeafInternal(this, id, payload);
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

	get localSessionId(): SessionId {
		return this.nodeIdNormalizer.localSessionId;
	}

	normalizeToOpSpace(id: NodeId): OpSpaceNodeId {
		return this.nodeIdNormalizer.normalizeToOpSpace(id);
	}
	normalizeToSessionSpace(id: OpSpaceNodeId, sessionId: SessionId): NodeId {
		return this.nodeIdNormalizer.normalizeToSessionSpace(id, sessionId);
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
			fail('RefreshingTestTree should be created within a describe() block and should only be read within it() blocks')
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

	public get traitLocation(): TestTraitLocation {
		return this.testTree.traitLocation;
	}

	public get view(): RevisionView {
		return this.testTree.view;
	}

	public get stable(): TestNode_0_0_2 {
		return this.testTree.stable;
	}

	public translateId(idConverter: NodeIdConverter): NodeId {
		return this.testTree.translateId(idConverter);
	}

	public toChangeNode(): ChangeNode {
		return convertTreeNodes<ChangeNode, ChangeNode>(this.testTree, (node) => convertNodeDataIds(node, identity));
	}

	public buildLeaf(id?: undefined, payload?: Payload): LeafNode<BuildTreeNode>;
	public buildLeaf(id: NodeId, payload?: Payload): LeafNode<ChangeNode>;
	public buildLeaf(id?: NodeId, payload?: Payload): LeafNode<BuildTreeNode> | LeafNode<ChangeNode> {
		return id === undefined ? this.testTree.buildLeaf(undefined, payload) : this.testTree.buildLeaf(id, payload);
	}

	public buildLeafInternal(id?: NodeId, payload?: Payload): LeafNode<TreeNode<BuildNodeInternal, NodeId>> {
		return this.testTree.buildLeafInternal(id, payload);
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

	get localSessionId(): SessionId {
		return this.testTree.localSessionId;
	}

	normalizeToOpSpace(id: NodeId): OpSpaceNodeId {
		return this.testTree.normalizeToOpSpace(id);
	}

	normalizeToSessionSpace(id: OpSpaceNodeId, sessionId: SessionId): NodeId {
		return this.testTree.normalizeToSessionSpace(id, sessionId);
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
export function buildLeafInternal(
	nodeIdContext: NodeIdContext,
	id?: NodeId,
	payload?: Payload
): LeafNode<TreeNode<BuildNodeInternal, NodeId>> {
	const leaf = buildLeaf(undefined, payload);
	return {
		definition: leaf.definition as Definition,
		identifier: id ?? nodeIdContext.generateNodeId(),
		traits: {},
	};
}

/** Translate an ID in one context to an ID in another */
function translateId(id: NodeId, from: NodeIdConverter, to: NodeIdConverter): NodeId {
	return to.convertToNodeId(from.convertToStableNodeId(id));
}

function translateTraitLocation(
	label: TraitLabel,
	parentId: NodeId,
	from: NodeIdConverter,
	to: NodeIdConverter
): TestTraitLocation {
	return {
		label,
		parent: translateId(parentId, from, to),
		get stable() {
			return memoizeGetter(this, 'stable', convertToTraitLocation_0_0_2(this, to));
		},
		translate: (idManager) => translateTraitLocation(label, parentId, to, idManager),
	};
}

function convertToTestNode_0_0_2(node: TestNode, idConverter: NodeIdConverter): TestNode_0_0_2 {
	// This is equivalent to calling tryConvertToChangeNode_0_0_2 but that causes lint to stack overflow
	return convertTreeNodes<TestNode, TestNode_0_0_2>(node, (nodeData) =>
		convertNodeDataIds(nodeData, (id) => idConverter.convertToStableNodeId(id))
	);
}

function convertToTraitLocation_0_0_2(
	traitLocation: TraitLocationInternal,
	idConverter: NodeIdConverter
): TraitLocationInternal_0_0_2 {
	const parent = idConverter.convertToStableNodeId(traitLocation.parent);
	return {
		label: traitLocation.label,
		parent,
	};
}
