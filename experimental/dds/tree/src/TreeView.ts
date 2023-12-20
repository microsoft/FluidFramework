/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { assert } from '@fluidframework/core-utils';
import { copyPropertyIfDefined, fail } from './Common';
import { NodeId, TraitLabel } from './Identifiers';
import { Delta, Forest, isParentedForestNode } from './Forest';
import { NodeData, Side } from './persisted-types';

/**
 * Specifies the location of a trait (a labeled sequence of nodes) within the tree.
 * @alpha
 */
export interface TraitLocation {
	readonly parent: NodeId;
	readonly label: TraitLabel;
}

/**
 * An immutable view of a distributed tree node.
 * @alpha
 */
export interface TreeViewNode extends NodeData<NodeId> {
	/** The IDs of the children under this node */
	readonly traits: ReadonlyMap<TraitLabel, readonly NodeId[]>;
	/** The parent and trait under which this node resides. Undefined iff this is the root node of the tree (i.e. {@link initialTree}). */
	readonly parentage?: TraitLocation;
}

/**
 * Index of a place within a trait.
 * 0 = before all nodes,
 * 1 = after first node,
 * etc.
 * @alpha
 */
export type PlaceIndex = number & { readonly PlaceIndex: unique symbol };

/**
 * Index of a node within a trait.
 * 0 = first node,
 * 1 = second node,
 * etc.
 * @alpha
 */
export type TraitNodeIndex = number & { readonly TraitNodeIndex: unique symbol };

/**
 * A place within a particular `TreeView` that is anchored relative to a specific node in the tree, or relative to the outside of the trait.
 * Valid iff 'trait' is valid and, if provided, sibling is in the Location specified by 'trait'.
 * @alpha
 */
export interface TreeViewPlace {
	readonly sibling?: NodeId;
	readonly side: Side;
	readonly trait: TraitLocation;
}

/**
 * Specifies the range of nodes from `start` to `end` within a trait within a particular `TreeView`.
 * Valid iff start and end are valid and are within the same trait.
 * @alpha
 */
export interface TreeViewRange {
	readonly start: TreeViewPlace;
	readonly end: TreeViewPlace;
}

/**
 * Contains some redundant information. Use only in computations between edits. Do not store.
 * @internal
 */
export interface NodeInTrait {
	readonly trait: TraitLocation;
	readonly index: TraitNodeIndex;
}

/**
 * A view of a distributed tree.
 * @alpha
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
		return this.tryGetViewNode(id) ?? fail('NodeId not found');
	}

	/** @returns the node associated with the given id in this view, or undefined if the node does not exist in this view */
	public tryGetViewNode(id: NodeId): TreeViewNode | undefined {
		const forestNode = this.forest.tryGet(id);
		if (forestNode !== undefined && isParentedForestNode(forestNode)) {
			const viewNode: TreeViewNode = {
				definition: forestNode.definition,
				identifier: forestNode.identifier,
				traits: forestNode.traits,
				parentage: {
					label: forestNode.traitParent,
					parent: forestNode.parentId,
				},
			};
			copyPropertyIfDefined(forestNode, viewNode, 'payload');
			return viewNode;
		}

		return forestNode;
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
		for (const label of [...node.traits.keys()].sort()) {
			const trait = node.traits.get(label);
			for (const childId of trait ?? fail('Expected trait with label')) {
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
		assert(this.root === view.root, 0x63d /* Delta can only be calculated between views that share a root */);
		return this.forest.delta(view.forest);
	}
}

function getIndex(side: Side, index: TraitNodeIndex): PlaceIndex {
	// eslint-disable-next-line @typescript-eslint/restrict-plus-operands
	return (side + index) as PlaceIndex;
}
