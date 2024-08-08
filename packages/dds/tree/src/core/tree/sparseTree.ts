/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { assert } from "@fluidframework/core-utils/internal";

import type { FieldKey } from "../schema-stored/index.js";

import { type UpPath, topDownPath } from "./pathTree.js";

/**
 * Sparse Tree of nodes.
 *
 * Contains both child and parent pointers, which are kept in sync.
 *
 * Each node is equivalent to a path through the tree.
 * This tree structure stores a collection of these paths, but deduplicating the common prefixes of the tree
 * prefix-tree style.
 */
export class SparseNode<TData> implements UpPath {
	/**
	 * SparseNode arrays are kept sorted the SparseNode's parentIndex for efficient search.
	 * Users of this field must take care to maintain invariants (correct parent pointers, not empty child arrays etc.)
	 *
	 * Performance Note:
	 * Large child lists could be updated more efficiently here using a data-structure optimized
	 * for efficient prefix sum updates, such as a Fenwick tree or Finger tree.
	 * This would be complicated by the need for parent pointers (including indexes),
	 * but is possible to do.
	 */
	public readonly children: Map<FieldKey, SparseNode<TData>[]> = new Map();

	public constructor(
		public parentField: FieldKey,
		public parentIndex: number,
		/**
		 * The parent of this `SparseNode` (an up pointer in the `SparseNode` tree).
		 * If the status of this node is `Alive`, then there must be a corresponding down pointer from the
		 * `parentPath` node to this node.
		 * When undefined, this node is the root and thus has no parent.
		 *
		 * When updating the tree, it is valid to transiently leave the up and down pointers inconsistent
		 * (updating down pointers first), but they must be consistent when the update is completed.
		 */
		public parentPath: SparseNode<TData> | undefined,
		public data: TData,
	) {}

	/**
	 * @returns true iff this SparseNode is the special root node that sits above all the detached fields.
	 * In this case, the fields are detached sequences.
	 * Note that the special root node should never appear in an UpPath
	 * since UpPaths represent this root as `undefined`.
	 */
	private isRoot(): boolean {
		return this.parentPath === undefined;
	}

	public get parent(): SparseNode<TData> | undefined {
		assert(
			this.parentPath !== undefined,
			0x4a4 /* SparseNode.parent is an UpPath API and thus should never be called on the root SparseNode. */,
		);
		// Root SparseNode corresponds to the undefined root for UpPath API.
		if (this.parentPath.isRoot()) {
			return undefined;
		}
		return this.parentPath;
	}

	/**
	 * Gets a child, adding a ref to it.
	 * Creates child (with 1 ref) if needed.
	 */
	public getOrCreateChild(key: FieldKey, index: number, data: () => TData): SparseNode<TData> {
		let field = this.children.get(key);
		if (field === undefined) {
			field = [];
			this.children.set(key, field);
		}
		// TODO: should do more optimized search (ex: binary search).
		let child = field.find((c) => c.parentIndex === index);
		if (child === undefined) {
			child = new SparseNode(key, index, this, data());
			field.push(child);
			// Keep list sorted by index.
			field.sort((a, b) => a.parentIndex - b.parentIndex);
		}
		return child;
	}

	/**
	 * Gets a child if it exists.
	 * Does NOT add a ref.
	 */
	public tryGetChild(key: FieldKey, index: number): SparseNode<TData> | undefined {
		const field = this.children.get(key);
		if (field === undefined) {
			return undefined;
		}
		// TODO: should do more optimized search (ex: binary search or better) using index.
		return field.find((c) => c.parentIndex === index);
	}

	/**
	 * Removes reference from this to `child`.
	 * Since PathNodes are doubly linked,
	 * the caller must ensure that the reference from child to parent is also removed (or the child is no longer used).
	 */
	public removeChild(child: SparseNode<TData>): void {
		const key = child.parentField;
		const field = this.children.get(key);
		// TODO: should do more optimized search (ex: binary search or better) using child.parentIndex()
		// Note that this is the index in the list of child paths, not the index within the field
		const childIndex = field?.indexOf(child) ?? -1;
		assert(childIndex !== -1, 0x4a5 /* child must be parented to be removed */);
		field?.splice(childIndex, 1);
		if (field?.length === 0) {
			this.afterEmptyField(key);
		}
	}

	/**
	 * Call this after directly editing the child array for a field to be empty.
	 * Handles cleaning up unneeded data
	 * (like the field in the map, and possibly this entire SparseNode and its parents if they are no longer needed.)
	 */
	public afterEmptyField(key: FieldKey): void {
		this.children.delete(key);
		if (this.children.size === 0) {
			this.disposeThis();
		}
	}

	/**
	 * Removes this from parent if alive, and sets this to disposed.
	 * Must only be called when this node is no longer needed (has no references and no children).
	 *
	 * Allowed when dangling (but not when disposed).
	 */
	private disposeThis(): void {
		this.parentPath?.removeChild(this);
	}
}

export function getDescendant<TData>(
	ancestor: SparseNode<TData>,
	path: UpPath | undefined,
): SparseNode<TData> {
	const topDown = topDownPath(path);
	let curr = ancestor;
	for (const hop of topDown) {
		const field = curr.children.get(hop.parentField);
		assert(field !== undefined, 0x4a6 /* Field not present in sparse node */);
		// TODO: should do more optimized search (ex: binary search).
		const child = field.find((c) => c.parentIndex === hop.parentIndex);
		assert(child !== undefined, 0x4a7 /* Child not present in sparse node field */);
		curr = child;
	}
	return curr;
}
