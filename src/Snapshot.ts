/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { assert, assertNotUndefined, compareIterables, fail } from './Common';
import { NodeId, TraitLabel } from './Identifiers';
import { ChangeNode, TraitMap, TraitLocation, StableRange, Side, StablePlace, NodeData } from './PersistedTypes';
import { compareTraits } from './EditUtilities';
import { createForest, Delta, Forest as GenericForest } from './Forest';

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
 * Specifies the range of nodes from `start` to `end` within a trait within a particular `Snapshot`.
 * Valid iff start and end are valid and are withing the same trait.
 * @public
 */
export interface SnapshotRange {
	readonly start: SnapshotPlace;
	readonly end: SnapshotPlace;
}

type Forest = GenericForest<NodeId, SnapshotNode, { label: TraitLabel; index: TraitNodeIndex }>;

/** Yield the direct children of the given `SnapshotNode` */
function* getSnapshotNodeChildren(
	parentNode: SnapshotNode
): Iterable<[NodeId, { label: TraitLabel; index: TraitNodeIndex }]> {
	for (const [label, trait] of parentNode.traits) {
		let index = 0 as TraitNodeIndex;
		for (const childId of trait) {
			yield [childId, { label, index }];
			index++;
		}
	}
}

/**
 * An immutable view of a distributed tree.
 * @public
 */
export class Snapshot {
	public readonly root: NodeId;
	private readonly forest: Forest;

	/**
	 * Constructs a Snapshot using the supplied tree.
	 * @param root - the root of the tree to use as the contents of the `Snapshot`
	 */
	public static fromTree(root: ChangeNode): Snapshot {
		function insertNodeRecursive(node: ChangeNode, newSnapshotNodes: Map<NodeId, SnapshotNode>): NodeId {
			const { identifier, payload, definition } = node;
			const traits: Map<TraitLabel, readonly NodeId[]> = new Map();
			// eslint-disable-next-line no-restricted-syntax
			for (const key in node.traits) {
				if (Object.prototype.hasOwnProperty.call(node.traits, key)) {
					const element = node.traits[key];
					traits.set(
						key as TraitLabel,
						element.map((n) => insertNodeRecursive(n, newSnapshotNodes))
					);
				}
			}
			const snapshotNode: SnapshotNode = { identifier, payload, definition, traits };
			newSnapshotNodes.set(snapshotNode.identifier, snapshotNode);
			return snapshotNode.identifier;
		}

		const map = new Map<NodeId, SnapshotNode>();
		return new Snapshot(insertNodeRecursive(root, map), createForest(getSnapshotNodeChildren).addAll(map));
	}

	private constructor(root: NodeId, forest: Forest) {
		this.root = root;
		this.forest = forest;
	}

	private getChangeNodeFromSnapshotNode(node: SnapshotNode): ChangeNode {
		/** Given the traits of a SnapshotNode, return the corresponding traits on a Node */
		const makeTraits = (traits: ReadonlyMap<TraitLabel, readonly NodeId[]>): TraitMap => {
			const entries = [...traits.entries()];
			const traitMap = {};
			Object.assign(
				traitMap,
				...entries.map(([label, trait]) => ({
					[label]: trait.map((nodeId) => this.getChangeNodeFromSnapshotNode(this.getSnapshotNode(nodeId))),
				}))
			);

			return traitMap;
		};

		return {
			identifier: node.identifier,
			payload: node.payload,
			definition: node.definition,
			traits: makeTraits(node.traits),
		};
	}

	/** Return a tree of JSON-compatible `ChangeNode`s representing the current state of this `Snapshot` */
	public getChangeNodeTree(): ChangeNode {
		return this.getChangeNodeFromSnapshotNode(this.forest.get(this.root));
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
		return this.getChangeNodeFromSnapshotNode(this.forest.get(id));
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
	 * Inserts all nodes (and their descendants) in a NodeSequence into the forest.
	 */
	public insertSnapshotNodes(sequence: Iterable<[NodeId, SnapshotNode]>): Snapshot {
		return new Snapshot(this.root, this.forest.addAll(sequence));
	}

	/**
	 * Add the given nodes into the forest. If an entry contains a key that is already present in the forest,
	 * run the merger function to resolve the conflict.
	 * @param nodes - the nodes to add to the forest
	 * @param merger - a function which, given two conflicting values for the same key, returns the correct value.
	 */
	public mergeWith(
		nodes: Iterable<[NodeId, SnapshotNode]>,
		merger: (oldVal: SnapshotNode, newVal: SnapshotNode, key: NodeId) => SnapshotNode
	): Snapshot {
		return new Snapshot(this.root, this.forest.mergeWith(nodes, merger));
	}

	/**
	 * Remove all nodes with the given ids from the forest
	 */
	public deleteNodes(nodes: Iterable<NodeId>): Snapshot {
		return new Snapshot(this.root, this.forest.deleteAll(nodes, true));
	}

	/**
	 * Check the validity of the given `StablePlace`
	 * @param place - the `StablePlace` to check
	 */
	public validateStablePlace(place: StablePlace): EditValidationResult {
		/* A StablePlace is valid if the following conditions are met:
		 *     1. A sibling or trait is defined.
		 *     2. If a sibling is defined, both it and its parent exist in the `Snapshot`.
		 *     3. If a trait is defined, its parent node exists in the `Snapshot`.
		 *     4. If a sibling and a trait location are both specified, the sibling needs to actually be in that trait.
		 */
		const { referenceSibling, referenceTrait } = place;

		// A well-formed `StablePlace` specifies exactly one of `referenceSibling` and `referenceTrait`.
		if (
			(referenceSibling === undefined && referenceTrait === undefined) ||
			(referenceSibling !== undefined && referenceTrait !== undefined)
		) {
			return EditValidationResult.Malformed;
		}

		if (referenceSibling !== undefined) {
			const siblingNode = this.forest.tryGet(referenceSibling);
			if (siblingNode === undefined) {
				return EditValidationResult.Invalid;
			}

			if (this.forest.tryGetParent(referenceSibling) === undefined) {
				return EditValidationResult.Invalid;
			}

			return EditValidationResult.Valid;
		}

		if (this.forest.tryGet(assertNotUndefined(referenceTrait).parent) === undefined) {
			return EditValidationResult.Invalid;
		}

		return EditValidationResult.Valid;
	}

	/**
	 * Check the validity of the given `StableRange`
	 * @param range - the `StableRange` to check
	 */
	public validateStableRange(range: StableRange): EditValidationResult {
		/* A StableRange is valid if the following conditions are met:
		 *     1. Its start and end places are valid.
		 *     2. Its start and end places are within the same trait.
		 *     3. Its start place is before its end place.
		 */
		const { start, end } = range;

		const startValidationResult = this.validateStablePlace(start);
		if (startValidationResult !== EditValidationResult.Valid) {
			return startValidationResult;
		}

		const endValidationResult = this.validateStablePlace(end);
		if (endValidationResult !== EditValidationResult.Valid) {
			return endValidationResult;
		}

		const startTraitLocation =
			start.referenceTrait || this.getTraitAddress(assertNotUndefined(start.referenceSibling)).trait;
		const endTraitLocation =
			end.referenceTrait || this.getTraitAddress(assertNotUndefined(end.referenceSibling)).trait;

		if (!compareTraits(startTraitLocation, endTraitLocation)) {
			return EditValidationResult.Invalid;
		}

		const { start: startPlace, end: endPlace } = this.rangeFromStableRange(range);
		const startIndex = this.findIndexWithinTrait(startPlace);
		const endIndex = this.findIndexWithinTrait(endPlace);

		if (startIndex > endIndex) {
			return EditValidationResult.Invalid;
		}

		return EditValidationResult.Valid;
	}

	/**
	 * Set the contents of the given trait
	 * @param traitLocation - the location of the trait
	 * @param newContents - the contents of the trait
	 */
	public updateTraitContents(traitLocation: TraitLocation, newContents: NodeId[]): Snapshot {
		const deleteTrait = newContents.length === 0;
		const { parent } = traitLocation;
		const oldNode = this.getSnapshotNode(parent);
		const traits = new Map(oldNode.traits.entries());
		if (deleteTrait) {
			traits.delete(traitLocation.label);
		} else {
			traits.set(traitLocation.label, newContents);
		}
		const node: SnapshotNode = { ...oldNode, traits };
		const snapshot = this.replaceNode(parent, node);
		assert(deleteTrait || snapshot.getTrait(traitLocation) === newContents, 'updateTraitContents should work');
		return snapshot;
	}

	/**
	 * Replaces a node. The node must exist in this `Snapshot`.
	 * @param nodeId - the id of the node to replace
	 * @param node - the new node
	 */
	public replaceNode(nodeId: NodeId, node: SnapshotNode): Snapshot {
		return new Snapshot(this.root, this.forest.replace(nodeId, node));
	}

	/**
	 * @returns the index just after place (which specifies a location between items).
	 */
	public findIndexWithinTrait(place: SnapshotPlace): PlaceIndex {
		if (place.sibling === undefined) {
			return this.getIndexOfSide(place.side, place.trait);
		}
		return getIndex(place.side, this.getTraitAddress(place.sibling).index);
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
		return this.forest.tryGetParent(id)?.parentData.label;
	}

	/**
	 * Returns the parent of a node. Returns undefined if the node does not exist in the snapshot or if it does not have a parent.
	 */
	public getParentSnapshotNode(id: NodeId): SnapshotNode | undefined {
		const parentInfo = this.forest.tryGetParent(id);
		if (parentInfo === undefined) {
			return undefined;
		}
		return this.getSnapshotNode(parentInfo.parentNode);
	}

	/**
	 * @param range - must be well formed and valid
	 */
	private getTraitLocationOfRange(range: StableRange): TraitLocation {
		const referenceTrait = range.start.referenceTrait ?? range.end.referenceTrait;
		if (referenceTrait) {
			return referenceTrait;
		}
		const sibling =
			range.start.referenceSibling ??
			range.end.referenceSibling ??
			fail('malformed range does not indicate trait');
		return this.getTraitAddress(sibling).trait;
	}

	/**
	 * @param node - must have a parent
	 */
	public getTraitAddress(node: NodeId): NodeInTrait {
		const parentData = this.forest.getParent(node);
		assert(parentData !== undefined, 'node must have parent');
		return {
			index: parentData.parentData.index,
			trait: {
				parent: parentData.parentNode,
				label: parentData.parentData.label,
			},
		};
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

	private sideOfRange(range: StableRange, sideOfRange: SideOfRange, trait: TraitLocation): SnapshotPlace {
		const siblingRelative = sideOfRange === SideOfRange.Start ? range.start : range.end;
		return {
			trait,
			side: siblingRelative.side,
			sibling: siblingRelative.referenceSibling,
		};
	}

	/**
	 * Express the given `StableRange` as a `Range`
	 */
	public rangeFromStableRange(range: StableRange): SnapshotRange {
		const location = this.getTraitLocationOfRange(range);
		// This can be optimized for better constant factors.
		return {
			start: this.sideOfRange(range, SideOfRange.Start, location),
			end: this.sideOfRange(range, SideOfRange.End, location),
		};
	}

	/**
	 * Express the given `StablePlace` as a `Place`
	 */
	public placeFromStablePlace(stablePlace: StablePlace): SnapshotPlace {
		const { side } = stablePlace;
		if (stablePlace.referenceSibling === undefined) {
			assert(stablePlace.referenceTrait !== undefined);
			return { trait: stablePlace.referenceTrait, side };
		}
		const nodeInTrait = this.getTraitAddress(stablePlace.referenceSibling);
		return {
			trait: nodeInTrait.trait,
			side: stablePlace.side,
			sibling: stablePlace.referenceSibling,
		};
	}

	/** Compares this snapshot to another for equality. */
	public equals(snapshot: Snapshot): boolean {
		if (this.size !== snapshot.size) {
			return false;
		}

		// TODO:#49100:Perf: make this faster and/or remove use by PrefetchingCheckout.

		const compareSnapshotNodes = (nodeA: SnapshotNode, nodeB: SnapshotNode): boolean => {
			if (nodeA.identifier !== nodeB.identifier) {
				return false;
			}

			if (nodeA.definition !== nodeB.definition) {
				return false;
			}

			if (nodeA.payload?.base64 !== nodeB.payload?.base64) {
				return false;
			}

			const idA = this.getTraitLabel(nodeA.identifier);
			const idB = this.getTraitLabel(nodeB.identifier);
			return idA === idB;
		};

		return compareIterables(this, snapshot, compareSnapshotNodes);
	}

	private *iterateNodeDescendants(nodeId: NodeId): IterableIterator<SnapshotNode> {
		const node = this.getSnapshotNode(nodeId);
		yield node;
		for (const child of getSnapshotNodeChildren(node)) {
			const childId = child[0];
			yield* this.iterateNodeDescendants(childId);
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
		return this.forest.delta(snapshot.forest, compareSnapshotNodes);
	}

	public [Symbol.iterator](): IterableIterator<SnapshotNode> {
		return this.iterateNodeDescendants(this.root);
	}
}

function compareSnapshotNodes(nodeA: SnapshotNode, nodeB: SnapshotNode): boolean {
	if (nodeA === nodeB) {
		return true;
	}

	if (nodeA.identifier !== nodeB.identifier) {
		return false;
	}

	if (nodeA.definition !== nodeB.definition) {
		return false;
	}

	if (nodeA.payload?.base64 !== nodeB.payload?.base64) {
		return false;
	}

	if (nodeA.traits.size !== nodeB.traits.size) {
		return false;
	}

	for (const traitA of nodeA.traits) {
		const [traitLabelA, nodeSequenceA] = traitA;
		const nodeSequenceB = nodeB.traits.get(traitLabelA);
		if (!nodeSequenceB) {
			return false;
		}

		if (nodeSequenceA.length !== nodeSequenceB.length) {
			return false;
		}

		for (let i = 0; i < nodeSequenceA.length; i++) {
			if (nodeSequenceA[i] !== nodeSequenceB[i]) {
				return false;
			}
		}
	}

	return true;
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

/**
 * The result of validation of an Edit.
 * @public
 */
export enum EditValidationResult {
	Malformed,
	Invalid,
	Valid,
}

enum SideOfRange {
	Start = 0,
	End = 1,
}
