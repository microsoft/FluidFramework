/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { assert, copyPropertyIfDefined, fail } from './Common';
import { NodeId, TraitLabel } from './Identifiers';
import { getChangeNodeFromView } from './TreeViewUtilities';
import { Delta, Forest } from './Forest';
import { ChangeNode, NodeData, Payload, TraitLocation } from './generic';

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
 * Defines a place relative to sibling.
 * The "outside" of a trait is the `undefined` sibling,
 * so After `undefined` is the beginning of the trait, and before `undefined` is the end.
 *
 * For this purpose, traits look like:
 *
 * `{undefined} - {Node 0} - {Node 1} - ... - {Node N} - {undefined}`
 *
 * Each `{value}` in the diagram is a possible sibling, which is either a Node or undefined.
 * Each `-` in the above diagram is a `Place`, and can be describe as being `After` a particular `{sibling}` or `Before` it.
 * This means that `After` `{undefined}` means the same `Place` as before the first node
 * and `Before` `{undefined}` means the `Place` after the last Node.
 *
 * Each place can be specified, (aka 'anchored') in two ways (relative to the sibling before or after):
 * the choice of which way to anchor a place only matters when the kept across an edit, and thus evaluated in multiple contexts where the
 * two place description may no longer evaluate to the same place.
 * @public
 */
export enum Side {
	Before = 0,
	After = 1,
}

/**
 * Specifies the range of nodes from `start` to `end` within a trait within a particular `TreeView`.
 * Valid iff start and end are valid and are withing the same trait.
 * @public
 */
export interface TreeViewRange {
	readonly start: TreeViewPlace;
	readonly end: TreeViewPlace;
}

/**
 * A view of a distributed tree.
 * @public
 */
export abstract class TreeView {
	public readonly root: NodeId;
	protected readonly forest: Forest;

	/**
	 * A cache of node's index within their parent trait.
	 * Used to avoid redundant linear scans of traits.
	 * Not shared across views; initialized to empty each time a TreeView is created.
	 */
	private traitIndicesCache?: Map<NodeId, TraitNodeIndex>;

	protected constructor(root: NodeId, forest: Forest) {
		this.root = root;
		this.forest = forest;
	}

	/**
	 * Constructs a `RevisionView` using the supplied tree.
	 * @param root - the root of the tree to use as the contents of the `RevisionView`
	 * @deprecated Expires 08-2021. Use `RevisionView.fromTree()` instead
	 */
	public static fromTree(root: ChangeNode, expensiveValidation = false): RevisionView {
		return RevisionView.fromTree(root, expensiveValidation);
	}

	/** Return a tree of JSON-compatible `ChangeNode`s representing the current state of this view */
	public getChangeNodeTree(): ChangeNode {
		return getChangeNodeFromView(this, this.root);
	}

	/** @returns the number of nodes in this view */
	public get size(): number {
		return this.forest.size;
	}

	/** @returns true iff a node with the given id exists in this view */
	public hasNode(id: NodeId): boolean {
		return this.forest.tryGet(id) !== undefined;
	}

	/** @returns a `ChangeNode` derived from the node in this view with the given id */
	public getChangeNode(id: NodeId): ChangeNode {
		return getChangeNodeFromView(this, id);
	}

	/** @returns the `ChangeNode`s derived from the nodes in this view with the given ids */
	public getChangeNodes(nodeIds: readonly NodeId[]): ChangeNode[] {
		return nodeIds.map((id) => this.getChangeNode(id));
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

	/** @returns the node associated with the given id in this view */
	public getViewNode(id: NodeId): TreeViewNode {
		return this.forest.get(id);
	}

	/**
	 * @returns the label of the trait under which a node with the given id resides. Returns undefined if the node is not present or if the
	 * given id belongs to the root node
	 */
	public getTraitLabel(id: NodeId): TraitLabel | undefined {
		return this.forest.tryGetParent(id)?.traitParent;
	}

	/**
	 * @returns the parent of the node with the given id. Returns undefined if the node does not exist in this view or if it does not have a
	 * parent.
	 */
	public getParentViewNode(id: NodeId): TreeViewNode | undefined {
		const parentInfo = this.forest.tryGetParent(id);
		if (parentInfo === undefined) {
			return undefined;
		}
		return this.getViewNode(parentInfo.parentId);
	}

	/** @returns the trait location of the node with the given id. The node must exist in this view and must have a parent */
	public getTraitLocation(id: NodeId): TraitLocation {
		const parentData = this.forest.getParent(id);
		assert(parentData !== undefined, 'node must have parent');
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
	public getIndexInTrait(node: NodeId): TraitNodeIndex {
		if (this.traitIndicesCache === undefined) {
			this.traitIndicesCache = new Map();
		} else {
			const cached = this.traitIndicesCache.get(node);
			if (cached !== undefined) {
				return cached;
			}
		}
		const parentData = this.forest.getParent(node);
		const parent = this.forest.get(parentData.parentId);
		const traitParent =
			parent.traits.get(parentData.traitParent) ?? fail('invalid parentData: trait parent not found.');
		let foundIndex = -1 as TraitNodeIndex;
		for (let i = 0; i < traitParent.length; i++) {
			const nodeInTrait = traitParent[i];
			const index = i as TraitNodeIndex;
			this.traitIndicesCache.set(nodeInTrait, index);
			if (nodeInTrait === node) {
				foundIndex = index;
			}
		}
		return foundIndex !== -1 ? foundIndex : fail('invalidParentData: node not found in specified trait');
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
		return this.iterateNodeDescendants(this.root);
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

	private *iterateNodeDescendants(nodeId: NodeId): IterableIterator<TreeViewNode> {
		const node = this.getViewNode(nodeId);
		yield node;
		for (const trait of node.traits.values()) {
			for (const childId of trait) {
				yield* this.iterateNodeDescendants(childId);
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

/**
 * Contains some redundant information. Use only in computations between edits. Do not store.
 * @public
 */
export interface NodeInTrait {
	readonly trait: TraitLocation;
	readonly index: TraitNodeIndex;
}
