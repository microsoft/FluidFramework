/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { assert, copyPropertyIfDefined, fail } from './Common';
import { NodeId, TraitLabel } from './Identifiers';
import { getChangeNodeFromSnapshot } from './SnapshotUtilities';
import { Delta, Forest } from './Forest';
import { ChangeNode, NodeData, Payload, TraitLocation } from './generic';

/**
 * An immutable view of a distributed tree node.
 * @public
 */
export interface SnapshotNode extends NodeData {
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
 * A place within a particular `Snapshot` that is anchored relative to a specific node in the tree, or relative to the outside of the trait.
 * Valid iff 'trait' is valid and, if provided, sibling is in the Location specified by 'trait'.
 * @public
 */
export interface SnapshotPlace {
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
 * Specifies the range of nodes from `start` to `end` within a trait within a particular `Snapshot`.
 * Valid iff start and end are valid and are withing the same trait.
 * @public
 */
export interface SnapshotRange {
	readonly start: SnapshotPlace;
	readonly end: SnapshotPlace;
}

/**
 * An immutable view of a distributed tree.
 * @public
 */
export class Snapshot {
	public readonly root: NodeId;
	private readonly forest: Forest;

	/**
	 * A cache of node's index within their parent trait.
	 * Used to avoid redundant linear scans of traits.
	 * Not shared across snapshots; initialized to empty each time a Snapshot is created.
	 */
	private traitIndicesCache?: Map<NodeId, TraitNodeIndex>;

	/**
	 * Constructs a Snapshot using the supplied tree.
	 * @param root - the root of the tree to use as the contents of the `Snapshot`
	 */
	public static fromTree(root: ChangeNode, expensiveValidation = false): Snapshot {
		function insertNodeRecursive(node: ChangeNode, newSnapshotNodes: Map<NodeId, SnapshotNode>): NodeId {
			const { identifier, definition } = node;
			const traits: Map<TraitLabel, readonly NodeId[]> = new Map();
			// eslint-disable-next-line no-restricted-syntax
			for (const key in node.traits) {
				if (Object.prototype.hasOwnProperty.call(node.traits, key)) {
					const element = node.traits[key];
					if (element.length > 0) {
						traits.set(
							key as TraitLabel,
							element.map((n) => insertNodeRecursive(n, newSnapshotNodes))
						);
					}
				}
			}
			const snapshotNode: SnapshotNode = { identifier, definition, traits };
			copyPropertyIfDefined(node, snapshotNode, 'payload');
			assert(
				!newSnapshotNodes.has(identifier),
				`duplicate node in tree for snapshot: { identifier: ${identifier}, definition: ${definition}`
			);
			newSnapshotNodes.set(snapshotNode.identifier, snapshotNode);
			return snapshotNode.identifier;
		}

		const map = new Map<NodeId, SnapshotNode>();
		return new Snapshot(insertNodeRecursive(root, map), Forest.create(expensiveValidation).add(map.values()));
	}

	private constructor(root: NodeId, forest: Forest) {
		this.root = root;
		this.forest = forest;
	}

	/** Return a tree of JSON-compatible `ChangeNode`s representing the current state of this `Snapshot` */
	public getChangeNodeTree(): ChangeNode {
		return getChangeNodeFromSnapshot(this, this.root);
	}

	/**
	 * Returns the number of nodes in this `Snapshot`
	 */
	public get size(): number {
		return this.forest.size;
	}

	/**
	 * @returns true iff the nodeId exists.
	 */
	public hasNode(id: NodeId): boolean {
		return this.forest.tryGet(id) !== undefined;
	}

	/**
	 * @returns a `ChangeNode` derived from the `SnapshotNode` in this snapshot with the given `NodeId`.
	 */
	public getChangeNode(id: NodeId): ChangeNode {
		return getChangeNodeFromSnapshot(this, id);
	}

	/**
	 * @returns the `ChangeNode`s derived from the `SnapshotNode`s in this snapshot with the given `NodeId`s.
	 */
	public getChangeNodes(nodeIds: readonly NodeId[]): ChangeNode[] {
		return nodeIds.map((id) => this.getChangeNode(id));
	}

	/**
	 * Asserts the forest is in a consistent state.
	 */
	public assertConsistent(): void {
		this.forest.assertConsistent();
	}

	/**
	 * Inserts all nodes in a NodeSequence into the forest.
	 */
	public addNodes(sequence: Iterable<SnapshotNode>): Snapshot {
		return new Snapshot(this.root, this.forest.add(sequence));
	}

	/**
	 * Remove all nodes with the given ids from the forest
	 */
	public deleteNodes(nodes: Iterable<NodeId>): Snapshot {
		return new Snapshot(this.root, this.forest.delete(nodes, true));
	}

	/**
	 * Parents a set of detached nodes at a specified place.
	 * @param nodesToAttach - the nodes to parent in the specified place. The nodes must already be present in the Snapshot.
	 * @param place - the location to insert the nodes.
	 */
	public attachRange(nodesToAttach: readonly NodeId[], place: SnapshotPlace): Snapshot {
		const { parent, label } = place.trait;
		const index = this.findIndexWithinTrait(place);
		return new Snapshot(this.root, this.forest.attachRangeOfChildren(parent, label, index, nodesToAttach));
	}

	/**
	 * Detaches a range of nodes from their parent. The detached nodes remain in the Snapshot.
	 * @param rangeToDetach - the range of nodes to detach
	 */
	public detachRange(rangeToDetach: SnapshotRange): { snapshot: Snapshot; detached: readonly NodeId[] } {
		const { start, end } = rangeToDetach;
		const { trait: traitLocation } = start;
		const { parent, label } = traitLocation;
		const startIndex = this.findIndexWithinTrait(start);
		const endIndex = this.findIndexWithinTrait(end);
		const { forest, detached } = this.forest.detachRangeOfChildren(parent, label, startIndex, endIndex);
		return { snapshot: new Snapshot(this.root, forest), detached };
	}

	/**
	 * Sets a node's value. The node must exist in this `Snapshot`.
	 * @param nodeId - the id of the node
	 * @param value - the new value
	 */
	public setNodeValue(nodeId: NodeId, value: Payload): Snapshot {
		return new Snapshot(this.root, this.forest.setValue(nodeId, value));
	}

	/**
	 * @returns the index just after place (which specifies a location between items).
	 * Performance note: this is O(siblings in trait).
	 */
	public findIndexWithinTrait(place: SnapshotPlace): PlaceIndex {
		if (place.sibling === undefined) {
			return this.getIndexOfSide(place.side, place.trait);
		}
		return getIndex(place.side, this.getIndexInTrait(place.sibling));
	}

	/**
	 * Returns the node associated with `id` in this `Snapshot`.
	 */
	public getSnapshotNode(id: NodeId): SnapshotNode {
		return this.forest.get(id);
	}

	/**
	 * Returns the label of the trait that a node is under. Returns undefined if the node is not present or if it is the root node.
	 */
	public getTraitLabel(id: NodeId): TraitLabel | undefined {
		return this.forest.tryGetParent(id)?.traitParent;
	}

	/**
	 * Returns the parent of a node. Returns undefined if the node does not exist in the snapshot or if it does not have a parent.
	 */
	public getParentSnapshotNode(id: NodeId): SnapshotNode | undefined {
		const parentInfo = this.forest.tryGetParent(id);
		if (parentInfo === undefined) {
			return undefined;
		}
		return this.getSnapshotNode(parentInfo.parentId);
	}

	/**
	 * @param node - must have a parent.
	 */
	public getTraitLocation(node: NodeId): TraitLocation {
		const parentData = this.forest.getParent(node);
		assert(parentData !== undefined, 'node must have parent');
		return {
			parent: parentData.parentId,
			label: parentData.traitParent,
		};
	}

	/**
	 * @param node - must have a parent.
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
	 * Return a trait given its location
	 * @param traitLocation - the location of the trait
	 */
	public getTrait(traitLocation: TraitLocation): readonly NodeId[] {
		return this.getSnapshotNode(traitLocation.parent).traits.get(traitLocation.label) ?? [];
	}

	private getIndexOfSide(side: Side, traitLocation: TraitLocation): PlaceIndex {
		return side === Side.After ? (0 as PlaceIndex) : (this.getTrait(traitLocation).length as PlaceIndex);
	}

	/** Compares this snapshot to another for equality. */
	public equals(snapshot: Snapshot): boolean {
		if (this.root !== snapshot.root) {
			return false;
		}

		// TODO:#49100:Perf: make this faster and/or remove use by PrefetchingCheckout.
		return this.forest.equals(snapshot.forest);
	}

	private *iterateNodeDescendants(nodeId: NodeId): IterableIterator<SnapshotNode> {
		const node = this.getSnapshotNode(nodeId);
		yield node;
		for (const trait of node.traits.values()) {
			for (const childId of trait) {
				yield* this.iterateNodeDescendants(childId);
			}
		}
	}

	/**
	 * Calculate the difference between two `Snapshot`s
	 * @param snapshot - the other snapshot to compare to this one
	 * @returns A {@link Delta} which nodes must be changed, added, and removed to get from `this` to `snapshot`.
	 * The snapshots must share a root.
	 */
	public delta(snapshot: Snapshot): Delta<NodeId> {
		assert(this.root === snapshot.root, 'Delta can only be calculated between snapshots that share a root');
		return this.forest.delta(snapshot.forest);
	}

	public [Symbol.iterator](): IterableIterator<SnapshotNode> {
		return this.iterateNodeDescendants(this.root);
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
