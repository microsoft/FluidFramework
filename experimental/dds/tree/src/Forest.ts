/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import BTree from '@taylorsw04/sorted-btree';
import { fail, assert } from './Common';

/**
 * Differences from one forest to another.
 */
export interface Delta<ID> {
	/**
	 * Nodes whose content changed.
	 */
	readonly changed: readonly ID[];
	/**
	 * Nodes that were added.
	 */
	readonly added: readonly ID[];
	/**
	 * Nodes that were removed.
	 */
	readonly removed: readonly ID[];
}

/**
 * An immutable forest of T.
 * Enforces single parenting, and allows querying the parent.
 *
 * Provides an iterator for iterating its nodes.
 *
 * @typeParam ID - Identifier for node in forest
 * @typeParam T - Type of node in forest
 * @typeParam TParentData - Data about the child to parent relation ship between two nodes in the forest
 */
export interface Forest<ID, T, TParentData> {
	/**
	 * Returns the number of nodes in the forest.
	 * */
	size: number;

	/**
	 * Adds the supplied nodes to the forest. The IDs must be unique in the forest.
	 */
	add(nodes: Iterable<[ID, T]>): Forest<ID, T, TParentData>;

	/**
	 * Replaces the node associated with `id`. The inserted node will have the same ID. A node with `id` must exist in the forest.
	 *
	 * By default, no reparenting is performed. The optionally provided iterators can be used to adjust the children of the replaced node.
	 * Any added children must already exist in the forest and be unparented.
	 * Any removed children will be unparented and remain in the forest.
	 *
	 * Care should be taken to ensure that the child set that results from the adds/deletes are consistent with those returned by the
	 * `getChildren` delegate provided to `createForest`.
	 *
	 */
	replace(id: ID, node: T, childrenAdded?: [ID, TParentData][], childrenRemoved?: ID[]): Forest<ID, T, TParentData>;

	/**
	 * @returns the node associated with `id`. Should not be used if there is no node with the provided id.
	 */
	get(id: ID): T;

	/**
	 * @returns the node associated with `id`, or undefined if there is none
	 */
	tryGet(id: ID): T | undefined;

	/**
	 * Deletes the node associated with each id in 'ids'. The deleted nodes must be unparented.
	 * @param ids - The IDs of the nodes to delete.
	 * @param deleteChildren - If true, recursively deletes descendants. Otherwise, leaves children unparented.
	 */
	delete(ids: Iterable<ID>, deleteChildren: boolean): Forest<ID, T, TParentData>;

	/**
	 * Checks that the metadata is correct, and the items form a forest.
	 * This is an expensive O(map size) operation.
	 */
	assertConsistent(): void;

	/**
	 * @returns the parent of `id`. Should not be used if there is no node with id or if id refers to the root node.
	 */
	getParent(id: ID): { parentNode: ID; parentData: TParentData };

	/**
	 * @returns undefined iff root, otherwise the parent of `id`.
	 */
	tryGetParent(id: ID): { parentNode: ID; parentData: TParentData } | undefined;

	/**
	 * Calculate the difference between two forests.
	 * @param forest - the other forest to compare to this one
	 * @param comparator - a function which returns true if two objects of type T are equivalent, false otherwise
	 * @returns A {@link Delta} listing which nodes must be changed, added, and removed to get from `this` to `forest`.
	 */
	delta(forest: Forest<ID, T, TParentData>, comparator?: (a: T, b: T) => boolean): Delta<ID>;

	/**
	 * Compares two forests for equality.
	 * @param forest - the other forest to compare to this one
	 * @param comparator - a function which returns true if two objects of type T are equivalent, false otherwise
	 * @returns true iff the forests are equal.
	 */
	equals(forest: Forest<ID, T, TParentData>, comparator?: (a: T, b: T) => boolean): boolean;
}

/**
 * Creates a new Forest.
 * @typeParam ID - Identifier for node in forest
 * @typeParam T - Type of node in forest
 * @typeParam TParentData - Data about the child to parent relation ship between two nodes in the forest
 */
export function createForest<ID, T, TParentData>(
	getChildren: (_: T) => Iterable<[ID, TParentData]>,
	comparison: (a: ID, b: ID) => number,
	expensiveValidation = false
): Forest<ID, T, TParentData> {
	return new ForestI(getChildren, comparison, expensiveValidation);
}

interface ForestState<ID, T, TParentData> {
	nodes: BTree<ID, T>;
	parents: BTree<ID, { parentNode: ID; parentData: TParentData }>;
	getChildren: (_: T) => Iterable<[ID, TParentData]>;
	expensiveValidation: boolean;
}

/**
 * Private implementation of Forest.
 *
 * @typeParam ID - Identifier for node in forest
 * @typeParam T - Type of node in forest
 * @typeParam TParentData - Data about the child to parent relation ship between two nodes in the forest
 */
class ForestI<ID, T, TParentData> implements Forest<ID, T, TParentData> {
	/**
	 * Contains the nodes in the forest.
	 * Used as an immutable data-structure: must not be modified.
	 */
	private readonly nodes: BTree<ID, T>;

	/**
	 * Metadata about the contents of items.
	 * Used for performance optimizations (fast parent access), and holds no actual item tree content.
	 */
	private readonly parents: BTree<ID, { parentNode: ID; parentData: TParentData }>;

	private readonly getChildren: (_: T) => Iterable<[ID, TParentData]>;

	/**
	 * If true, consistency checks will be applied after forest operations.
	 */
	private readonly expensiveValidation: boolean;

	/**
	 * Caller must ensure provided BTrees are not modified.
	 * Will not modify the BTrees.
	 */
	public constructor(data: ForestState<ID, T, TParentData>);

	/**
	 * Construct a new forest without reusing nodes from a previous one.
	 */
	public constructor(
		getChildren: (_: T) => Iterable<[ID, TParentData]>,
		comparison: (a: ID, b: ID) => number,
		expensiveValidation: boolean
	);

	public constructor(
		data: ForestState<ID, T, TParentData> | ((_: T) => Iterable<[ID, TParentData]>),
		comparison?: (a: ID, b: ID) => number,
		expensiveValidation?: boolean
	) {
		if (typeof data === 'object') {
			this.nodes = data.nodes;
			this.parents = data.parents;
			this.getChildren = data.getChildren;
			this.expensiveValidation = data.expensiveValidation;
		} else {
			assert(comparison !== undefined);
			this.nodes = new BTree(undefined, comparison);
			this.parents = new BTree(undefined, comparison);
			this.getChildren = data;
			this.expensiveValidation = expensiveValidation ?? false;
		}
		if (this.expensiveValidation) {
			this.assertConsistent();
		}
	}

	public get size(): number {
		return this.nodes.size;
	}

	public add(nodes: Iterable<[ID, T]>): Forest<ID, T, TParentData> {
		const mutableNodes = this.nodes.clone();
		const mutableParents = this.parents.clone();

		for (const [id, node] of nodes) {
			assert(!mutableNodes.has(id), 'can not add node with already existing id');
			mutableNodes.set(id, node);
			for (const [childId, parentData] of this.getChildren(node)) {
				mutableParents.set(childId, { parentNode: id, parentData });
			}
		}

		return new ForestI({
			nodes: mutableNodes,
			parents: mutableParents,
			getChildren: this.getChildren,
			expensiveValidation: this.expensiveValidation,
		});
	}

	public replace(
		id: ID,
		node: T,
		childrenAdded?: [ID, TParentData][],
		childrenRemoved?: ID[]
	): ForestI<ID, T, TParentData> {
		const old = this.nodes.get(id);
		assert(old, 'can not replace node that does not exist');

		const mutableNodes = this.nodes.clone();
		mutableNodes.set(id, node);

		let parents = this.parents;
		if (childrenAdded || childrenRemoved) {
			parents = this.parents.clone();

			if (childrenRemoved) {
				for (const childId of childrenRemoved) {
					parents.delete(childId);
				}
			}
			if (childrenAdded) {
				for (const [childId, parentData] of childrenAdded) {
					parents.set(childId, { parentNode: id, parentData });
				}
			}
		}

		return new ForestI({
			nodes: mutableNodes,
			parents,
			getChildren: this.getChildren,
			expensiveValidation: this.expensiveValidation,
		});
	}

	public get(id: ID): T {
		return this.tryGet(id) ?? fail('ID not found');
	}

	public tryGet(id: ID): T | undefined {
		return this.nodes.get(id);
	}

	public delete(ids: Iterable<ID>, deleteChildren: boolean): ForestI<ID, T, TParentData> {
		const mutableNodes = this.nodes.clone();
		const mutableParents = this.parents.clone();
		for (const id of ids) {
			this.deleteRecursive(mutableNodes, mutableParents, id, deleteChildren);
		}

		return new ForestI({
			nodes: mutableNodes,
			parents: mutableParents,
			getChildren: this.getChildren,
			expensiveValidation: this.expensiveValidation,
		});
	}

	private deleteRecursive(
		mutableNodes: BTree<ID, T>,
		mutableParents: BTree<ID, { parentNode: ID; parentData: TParentData }>,
		id: ID,
		deleteChildren: boolean
	): void {
		assert(mutableParents.get(id) === undefined, 'node must be un-parented to be deleted');
		const node = mutableNodes.get(id) ?? fail('node to delete must exist');
		mutableNodes.delete(id);
		for (const [child, _] of this.getChildren(node)) {
			mutableParents.delete(child);
			if (deleteChildren) {
				this.deleteRecursive(mutableNodes, mutableParents, child, deleteChildren);
			}
		}
	}

	public assertConsistent(): void {
		const checkedChildren = new Set<ID>([]);
		for (const [k, v] of this.nodes.entries(undefined, [])) {
			const d: T = v;
			for (const [id, _] of this.getChildren(d)) {
				assert(!checkedChildren.has(id), 'the item tree tree must not contain cycles or multi-parented nodes');
				assert(
					(this.parents.get(id)?.parentNode ?? fail('each node must have associated metadata')) === k,
					'cached parent is incorrect'
				);
				checkedChildren.add(id);
			}
		}
		const numberOfRoots = this.nodes.size - this.parents.size;
		assert(checkedChildren.size + numberOfRoots === this.nodes.size);
	}

	public getParent(id: ID): { parentNode: ID; parentData: TParentData } {
		return this.tryGetParent(id) ?? fail('ID not found');
	}

	public tryGetParent(id: ID): { parentNode: ID; parentData: TParentData } | undefined {
		return this.parents.get(id);
	}

	private static anyDifference(): { break: boolean } {
		return { break: true };
	}

	public equals(forest: Forest<ID, T, TParentData>, comparator: (a: T, b: T) => boolean = Object.is): boolean {
		if (this === forest) {
			return true;
		}
		if (forest.size !== this.size) {
			return false;
		}
		if (forest instanceof ForestI) {
			if (forest.nodes === this.nodes) {
				return true;
			}
			if (
				this.nodes.diff(
					forest.nodes,
					ForestI.anyDifference,
					ForestI.anyDifference,
					(_, nodeThis, nodeOther) => {
						if (!comparator(nodeThis, nodeOther)) {
							return { break: true };
						}
						return undefined;
					}
				) !== undefined
			) {
				return false;
			}
			return true;
		}

		fail('Comparison to two different types of Forest is not supported.');
	}

	public delta(forest: Forest<ID, T, TParentData>, comparator: (a: T, b: T) => boolean = Object.is): Delta<ID> {
		if (forest instanceof ForestI) {
			const changed: ID[] = [];
			const removed: ID[] = [];
			const added: ID[] = [];
			this.nodes.diff(
				forest.nodes,
				(id) => {
					removed.push(id);
				},
				(id) => {
					added.push(id);
				},
				(id, nodeThis, nodeOther) => {
					if (!comparator(nodeThis, nodeOther)) {
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

		fail('Comparison to two different types of Forest is not supported.');
	}
}
