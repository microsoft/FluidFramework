/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { Map as ImmutableMap } from 'immutable';
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
	[Symbol.iterator](): IterableIterator<[ID, T]>;

	/**
	 * Returns the number of nodes in the forest.
	 * */
	size: number;

	/**
	 * Adds the supplied node to the forest. The ID must be unique in the forest.
	 */
	add(id: ID, node: T): Forest<ID, T, TParentData>;

	/**
	 * Adds the supplied nodes to the forest. The IDs must be unique in the forest. When adding multiple nodes,
	 * prefer this method over repeat calls to `add()` as it provides the `Forest` an opportunity for optimization.
	 */
	addAll(nodes: Iterable<[ID, T]>): Forest<ID, T, TParentData>;

	/**
	 * Add the given nodes into this forest. If an entry contains a key that is already present in the forest,
	 * run the merger function to resolve the conflict.
	 * @param nodes - the nodes to add to this forest
	 * @param merger - a function which, given two conflicting values for the same key, returns the correct value.
	 */
	mergeWith(nodes: Iterable<[ID, T]>, merger: (oldVal: T, newVal: T, key: ID) => T): Forest<ID, T, TParentData>;

	/**
	 * Like delete then add, but works for nodes with parents. A node with `id` must exist in the forest.
	 * Any children of the old node that are not subsequently parented under the new node are left unparented.
	 */
	replace(id: ID, node: T): Forest<ID, T, TParentData>;

	/**
	 * @returns the node associated with `id`. Should not be used if there is no node with the provided id.
	 */
	get(id: ID): T;

	/**
	 * @returns the node associated with `id`, or undefined if there is none
	 */
	tryGet(id: ID): T | undefined;

	/**
	 * Deletes the node associated with 'id'. The deleted node must be unparented.
	 * @param id - The ID of the node to delete.
	 * @param deleteChildren - If true, recursively deletes descendants. Otherwise, leaves children unparented.
	 */
	delete(id: ID, deleteChildren: boolean): Forest<ID, T, TParentData>;

	/**
	 * Deletes the node associated with each id in 'ids'. The deleted nodes must be unparented.
	 * @param ids - The IDs of the nodes to delete.
	 * @param deleteChildren - If true, recursively deletes descendants. Otherwise, leaves children unparented.
	 */
	deleteAll(ids: Iterable<ID>, deleteChildren: boolean): Forest<ID, T, TParentData>;

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
	 * Calculate the difference between two forests
	 * @param forest - the other forest to compare to this one
	 * @param comparator - a function which returns true if two objects of type T are equivalent, false otherwise
	 * @returns A {@link Delta} which nodes must be changed, added, and removed to get from `this` to `forest`.
	 */
	delta(forest: Forest<ID, T, TParentData>, comparator?: (a: T, b: T) => boolean): Delta<ID>;
}

/**
 * Creates a new Forest.
 * @typeParam ID - Identifier for node in forest
 * @typeParam T - Type of node in forest
 * @typeParam TParentData - Data about the child to parent relation ship between two nodes in the forest
 */
export function createForest<ID, T, TParentData>(
	getChildren: (_: T) => Iterable<[ID, TParentData]>
): Forest<ID, T, TParentData> {
	return new ForestI(getChildren);
}

interface ForestState<ID, T, TParentData> {
	nodes: ImmutableMap<ID, T>;
	parents: ImmutableMap<ID, { parentNode: ID; parentData: TParentData }>;
	getChildren: (_: T) => Iterable<[ID, TParentData]>;
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
	 */
	private readonly nodes: ImmutableMap<ID, T>;

	/**
	 * Metadata about the contents of items.
	 * Used for performance optimizations (fast parent access), and holds no actual item tree content.
	 */
	private readonly parents: ImmutableMap<ID, { parentNode: ID; parentData: TParentData }>;

	private readonly getChildren: (_: T) => Iterable<[ID, TParentData]>;

	public constructor(data: ForestState<ID, T, TParentData> | ((_: T) => Iterable<[ID, TParentData]>)) {
		if (typeof data === 'object') {
			this.nodes = data.nodes;
			this.parents = data.parents;
			this.getChildren = data.getChildren;
		} else {
			this.nodes = ImmutableMap();
			this.parents = ImmutableMap();
			this.getChildren = data;
		}
	}

	public [Symbol.iterator](): IterableIterator<[ID, T]> {
		return this.nodes[Symbol.iterator]();
	}

	public get size(): number {
		return this.nodes.size;
	}

	public add(id: ID, node: T): ForestI<ID, T, TParentData> {
		assert(!this.nodes.has(id), 'can not add node with already existing id');
		const nodes = this.nodes.set(id, node);
		const parents = this.parents.withMutations((mutableParents) => {
			for (const [childId, parentData] of this.getChildren(node)) {
				mutableParents.set(childId, { parentNode: id, parentData });
			}
		});
		return new ForestI({ nodes, parents, getChildren: this.getChildren });
	}

	public addAll(nodes: Iterable<[ID, T]>): Forest<ID, T, TParentData> {
		return this.mergeWith(nodes, () => fail('can not add node with already existing id'));
	}

	public mergeWith(
		nodes: Iterable<[ID, T]>,
		merger: (oldVal: T, newVal: T, key: ID) => T
	): ForestI<ID, T, TParentData> {
		const parents = new Map<ID, { parentNode: ID; parentData: TParentData }>();
		const newNodes = this.nodes.withMutations((mutableNodes) => {
			for (const [id, node] of nodes) {
				let newNode = node;
				if (this.nodes.has(id)) {
					const currentNode = this.nodes.get(id) as T;
					newNode = merger(currentNode, node, id);
				}
				mutableNodes.set(id, newNode);
				for (const [childId, parentData] of this.getChildren(newNode)) {
					parents.set(childId, { parentNode: id, parentData });
				}
			}
		});
		const newParents = this.parents.merge(parents);
		return new ForestI({ nodes: newNodes, parents: newParents, getChildren: this.getChildren });
	}

	public replace(id: ID, node: T): ForestI<ID, T, TParentData> {
		const old = this.nodes.get(id);
		assert(old, 'can not replace node that does not exist');
		const nodes = this.nodes.set(id, node);
		const parents = this.parents.withMutations((mutableParents) => {
			for (const [child] of this.getChildren(old)) {
				mutableParents.delete(child);
			}
			for (const [childId, parentData] of this.getChildren(node)) {
				mutableParents.set(childId, { parentNode: id, parentData });
			}
		});
		return new ForestI({ nodes, parents, getChildren: this.getChildren });
	}

	public get(id: ID): T {
		return this.tryGet(id) ?? fail('ID not found');
	}

	public tryGet(id: ID): T | undefined {
		return this.nodes.get(id);
	}

	public delete(id: ID, deleteChildren: boolean): ForestI<ID, T, TParentData> {
		const mutableNodes = this.nodes.asMutable();
		const mutableParents = this.parents.asMutable();
		this.deleteRecursive(mutableNodes, mutableParents, id, deleteChildren);
		return new ForestI({
			nodes: mutableNodes.asImmutable(),
			parents: mutableParents.asImmutable(),
			getChildren: this.getChildren,
		});
	}

	public deleteAll(ids: Iterable<ID>, deleteChildren: boolean): ForestI<ID, T, TParentData> {
		const mutableNodes = this.nodes.asMutable();
		const mutableParents = this.parents.asMutable();
		for (const id of ids) {
			this.deleteRecursive(mutableNodes, mutableParents, id, deleteChildren);
		}

		return new ForestI({
			nodes: mutableNodes.asImmutable(),
			parents: mutableParents.asImmutable(),
			getChildren: this.getChildren,
		});
	}

	private deleteRecursive(
		mutableNodes: ImmutableMap<ID, T>,
		mutableParents: ImmutableMap<ID, { parentNode: ID; parentData: TParentData }>,
		id: ID,
		deleteChildren: boolean
	): void {
		assert(mutableParents.get(id) === undefined, 'node must be un-parented to be deleted');
		const node = mutableNodes.get(id) ?? fail('node to delete must exist');
		mutableNodes.delete(id);
		for (const [child] of this.getChildren(node)) {
			mutableParents.delete(child);
			if (deleteChildren) {
				this.deleteRecursive(mutableNodes, mutableParents, child, deleteChildren);
			}
		}
	}

	public assertConsistent(): void {
		const checkedChildren = new Set<ID>([]);
		for (const [k, v] of this.nodes) {
			const d: T = v;
			for (const [id] of this.getChildren(d)) {
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

	public delta(forest: Forest<ID, T, TParentData>, comparator: (a: T, b: T) => boolean = Object.is): Delta<ID> {
		const changed: ID[] = [];
		const merger = (oldValue: T, newValue: T, id: ID): T => {
			if (!comparator(oldValue, newValue)) {
				changed.push(id);
			}

			return newValue;
		};

		if (this === forest) {
			// The same: don't add any ids.
		} else if (forest instanceof ForestI) {
			// Fast path for ForestI
			// TODO:#48808: Optimize this case to skip reused interior nodes in the B+ tree.
			this.nodes.mergeWith(merger, forest.nodes);
		} else {
			// Generic slow path
			this.nodes.mergeWith(merger, forest);
		}

		// TODO:#48808: Include generating removed and added in optimized B+ tree diff.
		const removed: ID[] = [];
		for (const [id] of this) {
			if (forest.tryGet(id) === undefined) {
				removed.push(id);
			}
		}

		const added: ID[] = [];
		for (const [id] of forest) {
			if (this.tryGet(id) === undefined) {
				added.push(id);
			}
		}

		return {
			changed,
			added,
			removed,
		};
	}
}
