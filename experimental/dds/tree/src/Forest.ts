/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import BTree from 'sorted-btree';
import { assert } from '@fluidframework/core-utils';
import { fail, copyPropertyIfDefined, compareBtrees, compareFiniteNumbers } from './Common';
import { NodeId, TraitLabel } from './Identifiers';
import { comparePayloads } from './PayloadUtilities';
import { NodeData, Payload } from './persisted-types';

/**
 * A node that can be contained within a Forest
 * @alpha
 */
export interface ForestNode extends NodeData<NodeId> {
	readonly traits: ReadonlyMap<TraitLabel, readonly NodeId[]>;
}

/**
 * A node within a Forest that has a parent (and is therefore not the root node)
 *
 * @public
 */
export interface ParentedForestNode extends ForestNode, ParentData {}

/**
 * Check whether or not the given node in a forest is parented
 *
 * @public
 */
export function isParentedForestNode(node: ForestNode): node is ParentedForestNode {
	const parentedNode = node as ForestNode & Partial<ParentedForestNode>;
	const hasParent = parentedNode.parentId !== undefined;
	const hasTraitParent = parentedNode.traitParent !== undefined;
	assert(hasParent === hasTraitParent, 0x610 /* node must have either both parent and traitParent set or neither */);
	return hasParent;
}

/**
 * Information about a ForestNode's parent
 * @alpha
 */
export interface ParentData {
	readonly parentId: NodeId;
	readonly traitParent: TraitLabel;
}

/**
 * Differences from one forest to another.
 * @alpha
 */
export interface Delta<NodeId> {
	/**
	 * Nodes whose content changed.
	 */
	readonly changed: readonly NodeId[];
	/**
	 * Nodes that were added.
	 */
	readonly added: readonly NodeId[];
	/**
	 * Nodes that were removed.
	 */
	readonly removed: readonly NodeId[];
}

interface ForestState {
	nodes: BTree<NodeId, ForestNode>;
	expensiveValidation: boolean;
}

/**
 * An immutable forest of ForestNode.
 * Enforces single parenting, and allows querying the parent.
 * @alpha
 */
export class Forest {
	/**
	 * Contains the nodes in the forest.
	 * Used as an immutable data-structure: must not be modified.
	 */
	private readonly nodes: BTree<NodeId, ForestNode>;

	/**
	 * If true, consistency checks will be applied after forest operations.
	 */
	private readonly expensiveValidation: boolean;

	/**
	 * Caller must ensure provided BTrees are not modified.
	 * Will not modify the BTrees.
	 */
	private constructor(data: ForestState);

	/**
	 * Construct a new forest without reusing nodes from a previous one.
	 */
	private constructor(expensiveValidation: boolean);

	private constructor(data?: ForestState | boolean) {
		if (typeof data === 'object') {
			this.nodes = data.nodes;
			this.expensiveValidation = data.expensiveValidation;
		} else {
			this.nodes = new BTree<NodeId, ForestNode>(undefined, compareFiniteNumbers);
			this.expensiveValidation = data ?? false;
		}
		if (this.expensiveValidation) {
			this.assertConsistent();
		}
	}

	/**
	 * Creates a new Forest.
	 */
	public static create(expensiveValidation = false): Forest {
		return new Forest(expensiveValidation);
	}

	/**
	 * Returns the number of nodes in the forest.
	 */
	public get size(): number {
		return this.nodes.size;
	}

	/**
	 * Adds the supplied nodes to the forest. The nodes' IDs must be unique in the forest.
	 * @param nodes - the sequence of nodes to add to the forest. If any of them have children which exist in the forest already, those
	 * children will be parented. Any trait arrays present in a node must be non-empty. The nodes may be provided in any order.
	 */
	public add(nodes: Iterable<ForestNode>): Forest {
		const newNodes = [...nodes];
		const mutableNodes = this.nodes.clone();

		// This method iterates through the supplied nodes in two passes, first looking only at children and second actually adding the
		// nodes. This allows nodes to be passed in any order, e.g. a parent followed by a child or a child followed by a parent.

		const childToParent = new Map<NodeId, ParentData>(); // Temporarily records the parentage of children that don't exist yet

		// First, inspect the children of each node. If the child is already in the forest, update its parentage. If it is not in the
		// forest, it may be about to be added in the second loop below so record its parentage temporarily for when that happens.
		for (const node of newNodes) {
			const { identifier } = node;
			for (const [traitLabel, trait] of node.traits) {
				assert(trait.length > 0, 0x611 /* any trait arrays present in a node must be non-empty */);
				for (const childId of trait) {
					const child = mutableNodes.get(childId);
					if (child !== undefined) {
						// A child already exists in the forest, and its parent is now being added
						assert(!isParentedForestNode(child), 0x612 /* can not give a child multiple parents */);
						const parentedChild = {
							definition: child.definition,
							identifier: child.identifier,
							traits: child.traits,
							parentId: identifier,
							traitParent: traitLabel,
						};
						copyPropertyIfDefined(child, parentedChild, 'payload');
						// Overwrite the existing child with its parented version
						mutableNodes.set(childId, parentedChild);
					} else {
						// The child hasn't been added yet, so record its parentage to use when it is added below
						childToParent.set(childId, { parentId: identifier, traitParent: traitLabel });
					}
				}
			}
		}

		// Now add each node to the forest and apply any parentage information that was recorded above
		for (const node of newNodes) {
			const parentData = childToParent.get(node.identifier);
			assert(!mutableNodes.has(node.identifier), 0x613 /* can not add node with already existing id */);
			if (parentData !== undefined) {
				// This is a child whom we haven't added yet, but whose parent we already added above. Supply the recorded parentage info.
				const child = {
					definition: node.definition,
					identifier: node.identifier,
					traits: node.traits,
					...parentData,
				};
				copyPropertyIfDefined(node, child, 'payload');
				mutableNodes.set(node.identifier, child);
			} else {
				// This is a node that has no parent. Add it with no parentage information.
				mutableNodes.set(node.identifier, node);
			}
		}

		return new Forest({
			nodes: mutableNodes,
			expensiveValidation: this.expensiveValidation,
		});
	}

	/**
	 * Parents a set of nodes already in the forest at a specified location within a trait.
	 * @param parentId - the id of the parent under which to insert the new nodes
	 * @param label - the label of the trait under which to insert the new nodes
	 * @param index - the index in the trait after which to insert the new nodes
	 * @param childIds - the ids of the nodes to insert
	 */
	public attachRangeOfChildren(
		parentId: NodeId,
		label: TraitLabel,
		index: number,
		childIds: readonly NodeId[]
	): Forest {
		assert(index >= 0, 0x614 /* invalid attach index */);
		const parentNode = this.nodes.get(parentId);
		assert(parentNode !== undefined, 0x615 /* can not insert children under node that does not exist */);
		const mutableNodes = this.nodes.clone();
		const traits = new Map(parentNode.traits);
		const trait = traits.get(label) ?? [];
		assert(index <= trait.length, 0x616 /* invalid attach index */);

		// If there is nothing to insert, return early.
		// This is good for performance, but also avoids an edge case where an empty trait could be created (which is an error).
		if (childIds.length === 0) {
			return this;
		}
		const newChildren = [...trait.slice(0, index), ...childIds, ...trait.slice(index)];
		traits.set(label, newChildren);
		mutableNodes.set(parentId, { ...parentNode, traits });

		for (const childId of childIds) {
			mutableNodes.editRange(childId, childId, true, (_, n) => {
				assert(!isParentedForestNode(n), 0x617 /* can not attach node that already has a parent */);
				const breakVal: { value: ParentedForestNode } = {
					value: {
						...n,
						parentId,
						traitParent: label,
					},
				};
				return breakVal;
			});
		}

		return new Forest({
			nodes: mutableNodes,
			expensiveValidation: this.expensiveValidation,
		});
	}

	/**
	 * Detaches a range of nodes from their parent. The detached nodes remain in the `Forest`.
	 * @param parentId - the id of the parent from which to detach the nodes
	 * @param label - the label of the trait from which to detach the nodes
	 * @param startIndex - the index of the first node in the range to detach
	 * @param endIndex - the index after the last node in the range to detach
	 * @returns a new `Forest` with the nodes detached, and a list of the ids of the nodes that were detached
	 */
	public detachRangeOfChildren(
		parentId: NodeId,
		label: TraitLabel,
		startIndex: number,
		endIndex: number
	): { forest: Forest; detached: readonly NodeId[] } {
		assert(startIndex >= 0 && endIndex >= startIndex, 0x618 /* invalid detach index range */);
		const parentNode = this.nodes.get(parentId);
		assert(parentNode !== undefined, 0x619 /* can not detach children under node that does not exist */);
		if (startIndex === endIndex) {
			return { forest: this, detached: [] };
		}

		const mutableNodes = this.nodes.clone();
		const traits = new Map(parentNode.traits);
		const trait = traits.get(label) ?? [];
		assert(endIndex <= trait.length, 0x61a /* invalid detach index range */);
		const detached: NodeId[] = trait.slice(startIndex, endIndex);
		const newChildren = [...trait.slice(0, startIndex), ...trait.slice(endIndex)];
		const deleteTrait = newChildren.length === 0;
		if (deleteTrait) {
			traits.delete(label);
		} else {
			traits.set(label, newChildren);
		}

		mutableNodes.set(parentId, { ...parentNode, traits });
		for (const childId of detached) {
			mutableNodes.editRange(childId, childId, true, (_, n) => {
				const breakVal: { value: ForestNode } = {
					value: {
						definition: n.definition,
						identifier: n.identifier,
						traits: n.traits,
					},
				};
				copyPropertyIfDefined(n, breakVal.value, 'payload');
				return breakVal;
			});
		}

		return {
			forest: new Forest({
				nodes: mutableNodes,
				expensiveValidation: this.expensiveValidation,
			}),
			detached,
		};
	}

	/**
	 * Replaces a node's value. The node must exist in this `Forest`.
	 * @param nodeId - the id of the node
	 * @param value - the new value
	 */
	// eslint-disable-next-line @rushstack/no-new-null
	public setValue(nodeId: NodeId, value: Payload | null): Forest {
		const node = this.nodes.get(nodeId);
		assert(node !== undefined, 0x61b /* can not replace payload for node that does not exist */);
		const mutableNodes = this.nodes.clone();
		const newNode = { ...node };
		if (value !== null) {
			newNode.payload = value;
		} else {
			delete newNode.payload;
		}
		mutableNodes.set(nodeId, newNode);
		return new Forest({
			nodes: mutableNodes,
			expensiveValidation: this.expensiveValidation,
		});
	}

	/**
	 * @returns true if the node associated with `id` exists in this forest, otherwise false
	 */
	public has(id: NodeId): boolean {
		return this.nodes.has(id);
	}

	/**
	 * @returns the node associated with `id`. Should not be used if there is no node with the provided id.
	 */
	public get(id: NodeId): ForestNode {
		return this.nodes.get(id) ?? fail('NodeId not found');
	}

	/**
	 * @returns the node associated with `id`, or undefined if there is none
	 */
	public tryGet(id: NodeId): ForestNode | undefined {
		return this.nodes.get(id);
	}

	/**
	 * Deletes every node in ids (each of which must be unparented)
	 * @param ids - The IDs of the nodes to delete.
	 * @param deleteChildren - If true, recursively deletes descendants. Otherwise, leaves children unparented.
	 */
	public delete(ids: Iterable<NodeId>, deleteChildren: boolean): Forest {
		const mutableNodes = this.nodes.clone();
		for (const id of ids) {
			this.deleteRecursive(mutableNodes, id, deleteChildren);
		}

		return new Forest({
			nodes: mutableNodes,
			expensiveValidation: this.expensiveValidation,
		});
	}

	private deleteRecursive(mutableNodes: BTree<NodeId, ForestNode>, id: NodeId, deleteChildren: boolean): void {
		const node = mutableNodes.get(id) ?? fail('node to delete must exist');
		assert(!isParentedForestNode(node), 0x61c /* deleted nodes must be unparented */);
		mutableNodes.delete(id);
		for (const trait of node.traits.values()) {
			for (const childId of trait) {
				mutableNodes.editRange(childId, childId, true, (_, n) => {
					const breakVal: { value: ForestNode } = {
						value: {
							definition: n.definition,
							identifier: n.identifier,
							traits: n.traits,
						},
					};
					copyPropertyIfDefined(n, breakVal.value, 'payload');
					return breakVal;
				});

				if (deleteChildren) {
					this.deleteRecursive(mutableNodes, childId, deleteChildren);
				}
			}
		}
	}

	/**
	 * Checks that the metadata is correct, and the items form a forest.
	 * This is an expensive O(map size) operation.
	 */
	public assertConsistent(): void {
		const checkedChildren = new Set<NodeId>([]);
		for (const [nodeId, node] of this.nodes.entries(undefined, [])) {
			if (isParentedForestNode(node)) {
				const parent = this.get(node.parentId);
				const trait = parent.traits.get(node.traitParent);
				assert(trait !== undefined, 0x61d /* trait exists */);
				assert(trait.includes(node.identifier), 0x61e /* node is parented incorrectly */);
			}

			for (const trait of node.traits.values()) {
				assert(trait.length > 0, 0x61f /* trait is present but empty */);
				for (const childId of trait) {
					const child = this.nodes.get(childId);
					assert(child !== undefined, 0x620 /* child in trait is not in forest */);
					assert(isParentedForestNode(child), 0x621 /* child is not parented */);
					assert(child.parentId === node.identifier, 0x622 /* child parent pointer is incorrect */);
					assert(
						!checkedChildren.has(childId),
						0x623 /* the item tree tree must not contain cycles or multi-parented nodes */
					);
					assert(
						(child.parentId ?? fail('each node must have associated metadata')) === nodeId,
						0x624 /* cached parent is incorrect */
					);
					checkedChildren.add(childId);
				}
			}
		}
	}

	/**
	 * @returns the parent of `id`. Should not be used if there is no node with id or if id refers to the root node.
	 */
	public getParent(id: NodeId): ParentData {
		const child = this.nodes.get(id);
		if (child === undefined) {
			fail('NodeId not found');
		}

		assert(isParentedForestNode(child), 0x625 /* Node is not parented */);
		return { parentId: child.parentId, traitParent: child.traitParent };
	}

	/**
	 * @returns undefined iff root, otherwise the parent of `id`.
	 */
	public tryGetParent(id: NodeId): ParentData | undefined {
		const child = this.nodes.get(id);
		if (child === undefined || !isParentedForestNode(child)) {
			return undefined;
		}

		return {
			parentId: child.parentId,
			traitParent: child.traitParent,
		};
	}

	/**
	 * Compares two forests for equality.
	 * @param forest - the other forest to compare to this one
	 * @param comparator - a function which returns true if two objects of type ForestNode are equivalent, false otherwise
	 * @returns true iff the forests are equal.
	 */
	public equals(forest: Forest): boolean {
		if (this === forest || this.nodes === forest.nodes) {
			return true;
		}

		if (forest.size !== this.size) {
			return false;
		}

		return compareBtrees(this.nodes, forest.nodes, compareForestNodes);
	}

	/**
	 * Calculate the difference between two forests.
	 * @param forest - the other forest to compare to this one
	 * @param comparator - a function which returns true if two objects of type ForestNode are equivalent, false otherwise
	 * @returns A {@link Delta} listing which nodes must be changed, added, and removed to get from `this` to `forest`.
	 */
	public delta(forest: Forest): Delta<NodeId> {
		const changed: NodeId[] = [];
		const removed: NodeId[] = [];
		const added: NodeId[] = [];
		this.nodes.diffAgainst(
			forest.nodes,
			(id) => {
				removed.push(id);
			},
			(id) => {
				added.push(id);
			},
			(id, nodeThis, nodeOther) => {
				if (!compareForestNodes(nodeThis, nodeOther)) {
					changed.push(id);
				}
			}
		);
		return {
			changed,
			added,
			removed,
		};
	}
}

/**
 * @returns true iff two `ForestNodes` are equivalent.
 * May return false for nodes they contain equivalent payloads encoded differently.
 */
export function compareForestNodes(nodeA: ForestNode, nodeB: ForestNode): boolean {
	if (nodeA === nodeB) {
		return true;
	}

	if (nodeA.identifier !== nodeB.identifier) {
		return false;
	}

	if (nodeA.definition !== nodeB.definition) {
		return false;
	}

	if (!comparePayloads(nodeA.payload, nodeB.payload)) {
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
