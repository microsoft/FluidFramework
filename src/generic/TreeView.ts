/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { assert, copyPropertyIfDefined, fail } from '../Common';
import { NodeId, TraitLabel } from '../Identifiers';
import { Delta, Forest } from '../Forest';
import { ChangeNode, ChangeNode_0_0_2, NodeData, Payload, Side, TraitLocation } from './PersistedTypes';
import { tryConvertToChangeNode } from './Conversion002';
import { NodeIdConverter } from './NodeIdUtilities';

/**
 * An immutable view of a distributed tree node.
 * @public
 */
export interface TreeViewNode extends NodeData {
	readonly traits: ReadonlyMap<TraitLabel, readonly NodeId[]>;
}

/**
 * Index of a place within a trait.
 * 0 = before all nodes,
 * 1 = after first node,
 * etc.
 * @public
 */
export type PlaceIndex = number & { readonly PlaceIndex: unique symbol };

/**
 * Index of a node within a trait.
 * 0 = first node,
 * 1 = second node,
 * etc.
 * @public
 */
export type TraitNodeIndex = number & { readonly TraitNodeIndex: unique symbol };

/**
 * A place within a particular `TreeView` that is anchored relative to a specific node in the tree, or relative to the outside of the trait.
 * Valid iff 'trait' is valid and, if provided, sibling is in the Location specified by 'trait'.
 * @public
 */
export interface TreeViewPlace {
	readonly sibling?: NodeId;
	readonly side: Side;
	readonly trait: TraitLocation;
}

/**
 * Specifies the range of nodes from `start` to `end` within a trait within a particular `TreeView`.
 * Valid iff start and end are valid and are within the same trait.
 * @public
 */
export interface TreeViewRange {
	readonly start: TreeViewPlace;
	readonly end: TreeViewPlace;
}

/**
 * Contains some redundant information. Use only in computations between edits. Do not store.
 * @public
 */
export interface NodeInTrait {
	readonly trait: TraitLocation;
	readonly index: TraitNodeIndex;
}

/**
 * A view of a distributed tree.
 * @public
 */
export abstract class TreeView {
	public readonly root: NodeId;
	protected readonly forest: Forest;
	private readonly rootNode: TreeViewNode;

	/**
	 * A cache of node's index within their parent trait.
	 * Used to avoid redundant linear scans of traits.
	 * Not shared across views; initialized to empty each time a TreeView is created.
	 */
	private traitIndicesCache?: Map<NodeId, TraitNodeIndex>;

	protected constructor(root: NodeId, forest: Forest) {
		this.root = root;
		this.forest = forest;
		this.rootNode = this.getViewNode(root);
	}

	/** @returns the number of nodes in this view */
	public get size(): number {
		return this.forest.size;
	}

	/** @returns true iff a node with the given id exists in this view */
	public hasNode(id: NodeId): boolean {
		return this.forest.has(id);
	}

	/**
	 * @returns the index just after place (which specifies a location between items).
	 * Performance note: this is O(siblings in trait).
	 */
	public findIndexWithinTrait(place: TreeViewPlace): PlaceIndex {
		if (place.sibling === undefined) {
			return this.getIndexOfSide(place.side, place.trait);
		}
		return getIndex(place.side, this.getIndexInTrait(place.sibling));
	}

	/** @returns the node associated with the given id in this view. Fails if the node does not exist in this view. */
	public getViewNode(id: NodeId): TreeViewNode {
		return this.forest.get(id);
	}

	/** @returns the node associated with the given id in this view, or undefined if the node does not exist in this view */
	public tryGetViewNode(id: NodeId): TreeViewNode | undefined {
		return this.forest.tryGet(id);
	}

	/**
	 * @returns the label of the trait under which a node with the given id resides. Fails if the node does not exist in this view or if
	 * it is the root node.
	 */
	public getTraitLabel(id: NodeId): TraitLabel {
		return this.forest.getParent(id).traitParent;
	}

	/**
	 * @returns the label of the trait under which a node with the given id resides, or undefined if the node is not present in this
	 * view or if it is the root node
	 */
	public tryGetTraitLabel(id: NodeId): TraitLabel | undefined {
		return this.forest.tryGetParent(id)?.traitParent;
	}

	/**
	 * @returns the parent of the node with the given id. Fails if the node does not exist in this view or if it is the root node.
	 */
	public getParentViewNode(id: NodeId): TreeViewNode {
		const parentInfo = this.forest.getParent(id);
		return this.getViewNode(parentInfo.parentId);
	}

	/**
	 * @returns the parent of the node with the given id. Returns undefined if the node does not exist in this view or if it is the root
	 * node.
	 */
	public tryGetParentViewNode(id: NodeId): TreeViewNode | undefined {
		const parentInfo = this.forest.tryGetParent(id);
		if (parentInfo === undefined) {
			return undefined;
		}
		return this.getViewNode(parentInfo.parentId);
	}

	/**
	 * @returns the trait location of the node with the given id. Fails if the node does not exist in this view or of it is the root
	 * node
	 */
	public getTraitLocation(id: NodeId): TraitLocation {
		const parentData = this.forest.getParent(id);
		return {
			parent: parentData.parentId,
			label: parentData.traitParent,
		};
	}

	/**
	 * @returns the trait location of the node with the given id, or undefined if the node does not exist in this view or if it is the root
	 * node
	 */
	public tryGetTraitLocation(id: NodeId): TraitLocation | undefined {
		const parentData = this.forest.tryGetParent(id);
		if (parentData === undefined) {
			return undefined;
		}
		return {
			parent: parentData.parentId,
			label: parentData.traitParent,
		};
	}

	/**
	 * @returns the index within the trait under which the node with the given id resides. The node must exist in this view and must have a
	 * parent.
	 * Performance note: this is O(siblings in trait).
	 */
	public getIndexInTrait(id: NodeId): TraitNodeIndex {
		const index = this.tryGetIndexInTrait(id);
		return index ?? fail('ID does not exist in the forest.');
	}

	/**
	 * @returns the index within the trait under which the node with the given id resides, or undefined if the node does not exist in this
	 * view or does not have a parent.
	 * Performance note: this is O(siblings in trait).
	 */
	public tryGetIndexInTrait(id: NodeId): TraitNodeIndex | undefined {
		const cachedIndex = this.traitIndicesCache?.get(id);
		if (cachedIndex !== undefined) {
			return cachedIndex;
		}

		const parentData = this.forest.tryGetParent(id);
		if (parentData === undefined) {
			return undefined;
		}

		const parent = this.forest.tryGet(parentData.parentId);
		if (parent === undefined) {
			return undefined;
		}

		const trait = parent.traits.get(parentData.traitParent) ?? fail('inconsistent forest: trait parent not found');
		let foundIndex: TraitNodeIndex | undefined;
		if (trait.length === 0) {
			return foundIndex;
		}

		this.traitIndicesCache ??= new Map();
		for (let i = 0; i < trait.length; i++) {
			const nodeInTrait = trait[i];
			const index = i as TraitNodeIndex;
			this.traitIndicesCache.set(nodeInTrait, index);
			if (nodeInTrait === id) {
				foundIndex = index;
			}
		}

		return foundIndex;
	}

	/**
	 * @returns the trait at the given location. If no such trait exists, returns an empty trait.
	 */
	public getTrait(traitLocation: TraitLocation): readonly NodeId[] {
		return this.getViewNode(traitLocation.parent).traits.get(traitLocation.label) ?? [];
	}

	/** Asserts that the view's internal state is consistent. Useful for testing/validation. */
	public assertConsistent(): void {
		this.forest.assertConsistent();
	}

	public [Symbol.iterator](): IterableIterator<TreeViewNode> {
		return this.iterateNodeDescendants(this.rootNode);
	}

	/** @returns true iff the given view is equal to this view */
	public abstract equals(view: TreeView): boolean;

	/**
	 * @returns true iff the given view's forest of nodes is equivalent to this view's forest of nodes
	 * @param strict - if true, the views' forests must be the same object, otherwise they must merely be equivalent
	 */
	public hasEqualForest(view: TreeView, strict = false): boolean {
		if (this.root === view.root) {
			// TODO:#49100:Perf: make this faster and/or remove use by PrefetchingCheckout.
			return strict ? this.forest === view.forest : this.forest.equals(view.forest);
		}

		return false;
	}

	private *iterateNodeDescendants(node: TreeViewNode): IterableIterator<TreeViewNode> {
		yield node;
		for (const trait of node.traits.values()) {
			for (const childId of trait) {
				const child = this.getViewNode(childId);
				yield* this.iterateNodeDescendants(child);
			}
		}
	}

	private getIndexOfSide(side: Side, traitLocation: TraitLocation): PlaceIndex {
		return side === Side.After ? (0 as PlaceIndex) : (this.getTrait(traitLocation).length as PlaceIndex);
	}

	/**
	 * Calculate the difference between two `TreeView`s
	 * @param view - the other view to compare to this one
	 * @returns A {@link Delta} which nodes must be changed, added, and removed to get from `this` to `view`.
	 * The views must share a root.
	 */
	public delta(view: TreeView): Delta<NodeId> {
		assert(this.root === view.root, 'Delta can only be calculated between views that share a root');
		return this.forest.delta(view.forest);
	}
}

/**
 * An immutable view of a distributed tree.
 * @public
 */
export class RevisionView extends TreeView {
	/**
	 * Constructs a `RevisionView` using the supplied tree.
	 * @param root - the root of the tree to use as the contents of the `RevisionView`
	 */
	public static fromTree_0_0_2(
		root: ChangeNode_0_0_2,
		idConverter: NodeIdConverter,
		expensiveValidation = false
	): RevisionView | undefined {
		const tree = tryConvertToChangeNode(root, idConverter);
		if (tree === undefined) {
			return undefined;
		}
		return RevisionView.fromTree(tree, expensiveValidation);
	}

	/**
	 * Constructs a `RevisionView` using the supplied tree.
	 * @param root - the root of the tree to use as the contents of the `RevisionView`
	 */
	public static fromTree(root: ChangeNode, expensiveValidation = false): RevisionView {
		function insertNodeRecursive(node: ChangeNode, newViewNodes: Map<NodeId, TreeViewNode>): NodeId {
			const { identifier, definition } = node;
			const traits: Map<TraitLabel, readonly NodeId[]> = new Map();
			// eslint-disable-next-line no-restricted-syntax
			for (const key in node.traits) {
				if (Object.prototype.hasOwnProperty.call(node.traits, key)) {
					const element = node.traits[key];
					if (element.length > 0) {
						traits.set(
							key as TraitLabel,
							element.map((n) => insertNodeRecursive(n, newViewNodes))
						);
					}
				}
			}
			const viewNode: TreeViewNode = { identifier, definition, traits };
			copyPropertyIfDefined(node, viewNode, 'payload');
			assert(
				!newViewNodes.has(identifier),
				`duplicate node in tree for view: { identifier: ${identifier}, definition: ${definition}`
			);
			newViewNodes.set(viewNode.identifier, viewNode);
			return viewNode.identifier;
		}

		const map = new Map<NodeId, TreeViewNode>();
		return new RevisionView(insertNodeRecursive(root, map), Forest.create(expensiveValidation).add(map.values()));
	}

	/** Begin a transaction by generating a mutable `TransactionView` from this view */
	public openForTransaction(): TransactionView {
		return new TransactionView(this.root, this.forest);
	}

	public equals(view: TreeView): boolean {
		if (!(view instanceof RevisionView)) {
			return false;
		}

		return this.hasEqualForest(view);
	}
}

/**
 * An view of a distributed tree that is part of an ongoing transaction between `RevisionView`s.
 * @public
 */
export class TransactionView extends TreeView {
	/** Conclude a transaction by generating an immutable `RevisionView` from this view */
	public close(): RevisionView {
		return new RevisionView(this.root, this.forest);
	}

	/** Inserts all nodes in a NodeSequence into the view */
	public addNodes(sequence: Iterable<TreeViewNode>): TransactionView {
		return new TransactionView(this.root, this.forest.add(sequence));
	}

	/** Remove all nodes with the given ids from the view */
	public deleteNodes(nodes: Iterable<NodeId>): TransactionView {
		return new TransactionView(this.root, this.forest.delete(nodes, true));
	}

	/**
	 * Parents a set of detached nodes at a specified place.
	 * @param nodesToAttach - the nodes to parent in the specified place. The nodes must already be present in the view.
	 * @param place - the location to insert the nodes.
	 */
	public attachRange(nodesToAttach: readonly NodeId[], place: TreeViewPlace): TransactionView {
		const { parent, label } = place.trait;
		const index = this.findIndexWithinTrait(place);
		return new TransactionView(this.root, this.forest.attachRangeOfChildren(parent, label, index, nodesToAttach));
	}

	/**
	 * Detaches a range of nodes from their parent. The detached nodes remain in the view.
	 * @param rangeToDetach - the range of nodes to detach
	 */
	public detachRange(rangeToDetach: TreeViewRange): { view: TransactionView; detached: readonly NodeId[] } {
		const { start, end } = rangeToDetach;
		const { trait: traitLocation } = start;
		const { parent, label } = traitLocation;
		const startIndex = this.findIndexWithinTrait(start);
		const endIndex = this.findIndexWithinTrait(end);
		const { forest, detached } = this.forest.detachRangeOfChildren(parent, label, startIndex, endIndex);
		return { view: new TransactionView(this.root, forest), detached };
	}

	/**
	 * Sets or overwrites a node's value. The node must exist in this view.
	 * @param nodeId - the id of the node
	 * @param value - the new value
	 */
	public setNodeValue(nodeId: NodeId, value: Payload): TransactionView {
		return new TransactionView(this.root, this.forest.setValue(nodeId, value));
	}

	public equals(view: TreeView): boolean {
		if (!(view instanceof TransactionView)) {
			return false;
		}

		return this.hasEqualForest(view);
	}
}

function getIndex(side: Side, index: TraitNodeIndex): PlaceIndex {
	// eslint-disable-next-line @typescript-eslint/restrict-plus-operands
	return (side + index) as PlaceIndex;
}
