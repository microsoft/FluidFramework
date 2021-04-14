/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { assert, assertNotUndefined, copyPropertyIfDefined, fail } from './Common';
import { NodeId, TraitLabel } from './Identifiers';
import { ChangeNode, TraitLocation, StableRange, Side, StablePlace, NodeData } from './PersistedTypes';
import { compareTraits } from './EditUtilities';
import { compareSnapshotNodes, getChangeNodeFromSnapshot } from './SnapshotUtilities';
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

type Forest = GenericForest<NodeId, SnapshotNode, { label: TraitLabel }>;

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
 * Compares strings lexically to form a strict partial ordering.
 * Once https://github.com/qwertie/btree-typescript/pull/15 is merged, we can use the version of this function from it.
 */
function compareStrings(a: string, b: string): number {
	return a > b ? 1 : a === b ? 0 : -1;
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
					traits.set(
						key as TraitLabel,
						element.map((n) => insertNodeRecursive(n, newSnapshotNodes))
					);
				}
			}
			const snapshotNode: SnapshotNode = { identifier, definition, traits };
			copyPropertyIfDefined(node, snapshotNode, 'payload');
			newSnapshotNodes.set(snapshotNode.identifier, snapshotNode);
			return snapshotNode.identifier;
		}

		const map = new Map<NodeId, SnapshotNode>();
		return new Snapshot(
			insertNodeRecursive(root, map),
			createForest(getSnapshotNodeChildren, compareStrings, expensiveValidation).add(map)
		);
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
	 * Inserts all nodes (and their descendants) in a NodeSequence into the forest.
	 */
	public insertSnapshotNodes(sequence: Iterable<[NodeId, SnapshotNode]>): Snapshot {
		return new Snapshot(this.root, this.forest.add(sequence));
	}

	/**
	 * Remove all nodes with the given ids from the forest
	 */
	public deleteNodes(nodes: Iterable<NodeId>): Snapshot {
		return new Snapshot(this.root, this.forest.delete(nodes, true));
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

			// Detached nodes and the root are invalid anchors.
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
			start.referenceTrait || this.getTraitLocation(assertNotUndefined(start.referenceSibling));
		const endTraitLocation = end.referenceTrait || this.getTraitLocation(assertNotUndefined(end.referenceSibling));

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
	 * Detaches a range of nodes from their parent. The detached nodes remain in the Snapshot.
	 * @param rangeToDetach - the range of nodes to detach
	 */
	public detach(rangeToDetach: StableRange): { snapshot: Snapshot; detached: readonly NodeId[] } {
		const { start, end } = this.rangeFromStableRange(rangeToDetach);
		const { trait: traitLocation } = start;
		const { parent: parentId, label } = traitLocation;
		const parentNode = this.getSnapshotNode(parentId);
		const traits = new Map(parentNode.traits);
		const trait = traits.get(label) ?? [];
		const startIndex = this.findIndexWithinTrait(start);
		const endIndex = this.findIndexWithinTrait(end);

		const detached: NodeId[] = trait.slice(startIndex, endIndex);
		const newChildren = [...trait.slice(0, startIndex), ...trait.slice(endIndex)];

		const deleteTrait = newChildren.length === 0;
		if (deleteTrait) {
			traits.delete(label);
		} else {
			traits.set(label, newChildren);
		}
		const newParent: SnapshotNode = { ...parentNode, traits };
		const snapshot = new Snapshot(this.root, this.forest.replace(parentId, newParent, undefined, detached));
		assert(deleteTrait || snapshot.getTrait(traitLocation) === newChildren, 'updateTraitContents should work');
		return { snapshot, detached };
	}

	/**
	 * Parents a set of nodes in a specified location within a trait.
	 * @param nodesToInsert - the nodes to parent in the specified place. The nodes must already be present in the Snapshot.
	 * @param placeToInsert - the location to insert the nodes.
	 */
	public insertIntoTrait(nodesToInsert: readonly NodeId[], placeToInsert: StablePlace): Snapshot {
		const place = this.placeFromStablePlace(placeToInsert);
		const { parent: parentId, label } = place.trait;
		const parentNode = this.getSnapshotNode(parentId);
		const traits = new Map(parentNode.traits);
		const trait = traits.get(label) ?? [];

		const index = this.findIndexWithinTrait(place);
		const newChildren = [...trait.slice(0, index), ...nodesToInsert, ...trait.slice(index)];
		traits.set(label, newChildren);

		const newParent: SnapshotNode = { ...parentNode, traits };
		const snapshot = new Snapshot(
			this.root,
			this.forest.replace(
				parentId,
				newParent,
				nodesToInsert.map((nodeId) => [nodeId, { label }]),
				undefined
			)
		);
		assert(snapshot.getTrait(place.trait) === newChildren, 'updateTraitContents should work');
		return snapshot;
	}

	/**
	 * Replaces a node's data and leaves the children parented. The node must exist in this `Snapshot`.
	 * @param nodeId - the id of the node to replace
	 * @param nodeData - the new data
	 */
	public replaceNodeData(nodeId: NodeId, nodeData: NodeData): Snapshot {
		const existingNode = this.getSnapshotNode(nodeId);
		return new Snapshot(this.root, this.forest.replace(nodeId, { ...nodeData, traits: existingNode.traits }));
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
		return this.getTraitLocation(sibling);
	}

	/**
	 * @param node - must have a parent.
	 */
	public getTraitLocation(node: NodeId): TraitLocation {
		const parentData = this.forest.getParent(node);
		assert(parentData !== undefined, 'node must have parent');
		return {
			parent: parentData.parentNode,
			label: parentData.parentData.label,
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
		const parent = this.forest.get(parentData.parentNode);
		const traitParent =
			parent.traits.get(parentData.parentData.label) ?? fail('invalid parentData: trait parent not found.');
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
		return {
			trait: this.getTraitLocation(stablePlace.referenceSibling),
			side: stablePlace.side,
			sibling: stablePlace.referenceSibling,
		};
	}

	/** Compares this snapshot to another for equality. */
	public equals(snapshot: Snapshot): boolean {
		if (this.root !== snapshot.root) {
			return false;
		}

		// TODO:#49100:Perf: make this faster and/or remove use by PrefetchingCheckout.
		return this.forest.equals(snapshot.forest, compareSnapshotNodes);
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
	/**
	 * The edit contained one or more malformed changes (e.g. was missing required fields such as `id`),
	 * or contained a sequence of changes that could not possibly be applied sequentially without error
	 * (e.g. an edit which tries to insert the same detached node twice).
	 */
	Malformed,
	/**
	 * The edit is well-formed but cannot be applied to the current view, generally because concurrent changes
	 * caused one or more merge conflicts.
	 * For example, the edit refers to the `StablePlace` after node `C`, but `C` has since been deleted.
	 */
	Invalid,
	/**
	 * The edit is well-formed and can be applied to the current view.
	 */
	Valid,
}

enum SideOfRange {
	Start = 0,
	End = 1,
}
