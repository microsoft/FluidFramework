/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { assert, oob, debugAssert } from "@fluidframework/core-utils/internal";

import {
	CursorLocationType,
	CursorMarker,
	type DetachedField,
	type FieldKey,
	type FieldUpPath,
	type ITreeCursorSynchronous,
	type PathRootPrefix,
	type TreeType,
	type UpPath,
	type Value,
	detachedFieldAsKey,
	rootField,
} from "../core/index.js";
import { fail } from "../util/index.js";
import { UsageError } from "@fluidframework/telemetry-utils/internal";

/**
 * {@link ITreeCursorSynchronous} that can return the underlying node objects.
 */
export interface CursorWithNode<TNode> extends ITreeCursorSynchronous {
	/**
	 * Gets the underlying object for the current node.
	 *
	 * Only valid when `mode` is `Nodes`.
	 */
	getNode(): TNode;

	/**
	 * Create a copy of this cursor which navigates independently,
	 * and is initially located at the same place as this one.
	 *
	 * Depending on the cursor implementation this may be significantly faster
	 * than other ways to copy the cursor
	 * (such as creating a new one and walking the path from this one).
	 */
	fork(): CursorWithNode<TNode>;
}

/**
 * Create a cursor, in `nodes` mode at the root of the provided tree.
 *
 * @returns an {@link ITreeCursorSynchronous} for a single root in `nodes` mode.
 */
export function stackTreeNodeCursor<TNode>(
	adapter: CursorAdapter<TNode>,
	root: TNode,
): CursorWithNode<TNode> {
	return new StackCursor(adapter, [], [], [root], 0);
}

/**
 * Create a cursor, in `fields` mode at the `detachedField` under the provided `root`.
 *
 * @returns an {@link ITreeCursorSynchronous} for `detachedField` of `root` in `fields` mode.
 */
export function stackTreeFieldCursor<TNode>(
	adapter: CursorAdapter<TNode>,
	root: TNode,
	detachedField: DetachedField = rootField,
): CursorWithNode<TNode> {
	const cursor = stackTreeNodeCursor(adapter, root);
	// Because the root node in `stackTreeNodeCursor` is treated as the above detached fields node,
	// using it then just entering the correct field doesn't mess up the paths reported by the cursor.
	cursor.enterField(detachedFieldAsKey(detachedField));
	return cursor;
}

/**
 * Provides functionality to allow a {@link stackTreeNodeCursor} and {@link stackTreeFieldCursor} to implement cursors.
 */
export interface CursorAdapter<TNode> {
	/**
	 * @returns the value of the given node.
	 */
	value(node: TNode): Value;
	/**
	 * @returns the type of the given node.
	 */
	type(node: TNode): TreeType;
	/**
	 * @returns the keys for non-empty fields on the given node.
	 */
	keysFromNode(node: TNode): readonly FieldKey[];
	/**
	 * @returns the child nodes for the given node and key.
	 */
	getFieldFromNode(node: TNode, key: FieldKey): readonly TNode[];
}

type SiblingsOrKey<TNode> = readonly TNode[] | readonly FieldKey[];

/**
 * A class that satisfies part of the ITreeCursorSynchronous implementation.
 */
export abstract class SynchronousCursor {
	public readonly [CursorMarker] = true;
	public readonly pending = false;

	public skipPendingFields(): boolean {
		return true;
	}
}

/**
 * A simple general purpose ITreeCursorSynchronous implementation.
 *
 * As this is a generic implementation, it's ability to optimize is limited.
 *
 * @privateRemarks
 * Note that TNode can be `null` (and we should support `undefined` as well),
 * so be careful using types like `TNode | undefined` and expressions like `TNode ??`.
 *
 * TODO:
 * 1. Unit tests for this.
 * 2. Support for cursors which are field cursors at the root.
 */
class StackCursor<TNode> extends SynchronousCursor implements CursorWithNode<TNode> {
	public readonly [CursorMarker] = true;
	/**
	 * Might start at special root where fields are detached sequences.
	 *
	 * @param adapter - policy logic.
	 * @param siblingStack - Stack of collections of siblings along the path through the tree:
	 * does not include current level (which is stored in `siblings`).
	 * Even levels in the stack (starting from 0) are sequences of nodes and odd levels
	 * are for fields keys on a node.
	 * @param indexStack - Stack of indices into the corresponding levels in `siblingStack`.
	 * @param siblings - Siblings at the current level (not included in `siblingStack`).
	 * @param index - Index into `siblings`.
	 */
	public constructor(
		private readonly adapter: CursorAdapter<TNode>,
		private readonly siblingStack: SiblingsOrKey<TNode>[],
		private readonly indexStack: number[],
		private siblings: SiblingsOrKey<TNode>,
		private index: number,
	) {
		super();
	}

	public getFieldKey(): FieldKey {
		debugAssert(() =>
			this.mode === CursorLocationType.Fields ? true : "must be in fields mode",
		);
		return this.siblings[this.index] as FieldKey;
	}

	private getStackedFieldKey(height: number): FieldKey {
		assert(height % 2 === 1, 0x3b8 /* must field height */);
		const siblingStack = this.siblingStack[height] ?? oob();
		const indexStack = this.indexStack[height] ?? oob();
		return siblingStack[indexStack] as FieldKey;
	}

	private getStackedNodeIndex(height: number): number {
		// assert(height % 2 === 0, "must be node height");
		return this.indexStack[height] ?? oob();
	}

	private getStackedNode(height: number): TNode {
		const index = this.getStackedNodeIndex(height);
		// Test is failing when using `?? oob()` here.
		// eslint-disable-next-line @typescript-eslint/no-non-null-assertion
		return (this.siblingStack[height] as readonly TNode[])[index]!;
	}

	public getFieldLength(): number {
		// assert(this.mode === CursorLocationType.Fields, "must be in fields mode");
		return this.getField().length;
	}

	public enterNode(index: number): void {
		// assert(this.mode === CursorLocationType.Fields, "must be in fields mode");
		const siblings = this.getField();
		if (!(index in siblings)) {
			throw new UsageError(
				"A child does not exist at the specified index, check the status of a node using `Tree.status()`.",
			);
		}
		this.siblingStack.push(this.siblings);
		this.indexStack.push(this.index);
		this.index = index;
		this.siblings = siblings;
	}

	public getPath(prefix?: PathRootPrefix): UpPath | undefined {
		assert(this.mode === CursorLocationType.Nodes, 0x3b9 /* must be in nodes mode */);
		return this.getOffsetPath(0, prefix);
	}

	public getFieldPath(prefix?: PathRootPrefix): FieldUpPath {
		assert(this.mode === CursorLocationType.Fields, 0x449 /* must be in fields mode */);
		return {
			field:
				this.indexStack.length === 1
					? (prefix?.rootFieldOverride ?? this.getFieldKey())
					: this.getFieldKey(),
			parent: this.getOffsetPath(1, prefix),
		};
	}

	private getOffsetPath(
		offset: number,
		prefix: PathRootPrefix | undefined,
	): UpPath | undefined {
		// It is more efficient to handle prefix directly in here rather than delegating to PrefixedPath.

		const length = this.indexStack.length - offset;
		if (length === 0) {
			return prefix?.parent; // At root
		}

		assert(length > 0, 0x44a /* invalid offset to above root */);
		assert(length % 2 === 0, 0x44b /* offset path must point to node not field */);

		const getIndex = (height: number): number => {
			let parentIndex: number =
				height === this.indexStack.length ? this.index : this.getStackedNodeIndex(height);
			if (prefix !== undefined && height === 2) {
				parentIndex += prefix.indexOffset ?? 0;
			}
			return parentIndex;
		};

		// Perf Note:
		// This is O(depth) in tree.
		// If many different anchors are created, this could be optimized to amortize the costs.
		// For example, the cursor could cache UpPaths from the anchorSet when creating an anchor,
		// then reuse them as a starting point when making another.
		// Could cache this at one depth, and remember the depth.
		// When navigating up, adjust cached anchor if present.

		let path: UpPath | undefined = prefix?.parent;
		// Skip top level, since root node in path is "undefined" and does not have a parent or index.
		for (let height = 2; height <= length; height += 2) {
			const fieldOverride = height === 2 ? prefix?.rootFieldOverride : undefined;
			path = {
				parent: path,
				parentIndex: getIndex(height),
				parentField: fieldOverride ?? this.getStackedFieldKey(height - 1),
			};
		}

		return path;
	}

	public fork(): StackCursor<TNode> {
		// Siblings arrays are not modified during navigation and do not need be be copied.
		// This allows this copy to be shallow, and `this.siblings` below to not be copied as all.
		return new StackCursor<TNode>(
			this.adapter,
			[...this.siblingStack],
			[...this.indexStack],
			this.siblings,
			this.index,
		);
	}

	public enterField(key: FieldKey): void {
		// assert(this.mode === CursorLocationType.Nodes, "must be in nodes mode");
		this.siblingStack.push(this.siblings);
		this.indexStack.push(this.index);

		// For fields, siblings are only used for key lookup and
		// nextField and which has arbitrary iteration order,
		// so making a array of just key here works.
		// This adds an allocation, so it's optimizing code simplicity and for the other use case (enumeration)
		// at the cost of an allocation here.
		this.index = 0;
		this.siblings = [key];
	}

	public get mode(): CursorLocationType {
		return this.siblingStack.length % 2 === 0
			? CursorLocationType.Nodes
			: CursorLocationType.Fields;
	}

	public nextField(): boolean {
		this.index += 1;
		if (this.index === (this.siblings as []).length) {
			this.exitField();
			return false;
		}
		return true;
	}

	public firstField(): boolean {
		// assert(this.mode === CursorLocationType.Nodes, "must be in nodes mode");
		const fields = this.adapter.keysFromNode(this.getNode());
		if (fields.length === 0) {
			return false;
		}

		this.siblingStack.push(this.siblings);
		this.indexStack.push(this.index);
		this.index = 0;
		this.siblings = fields;
		return true;
	}

	public seekNodes(offset: number): boolean {
		// assert(this.mode === CursorLocationType.Nodes, "can only seekNodes when in Nodes");
		this.index += offset;
		if (this.index in this.siblings) {
			return true;
		}
		this.exitNode();
		return false;
	}

	public firstNode(): boolean {
		// assert(this.mode === CursorLocationType.Fields, "firstNode only allowed in fields mode");
		const nodes = this.getField();
		if (nodes.length === 0) {
			return false;
		}
		this.siblingStack.push(this.siblings);
		this.indexStack.push(this.index);
		this.index = 0;
		this.siblings = nodes;
		return true;
	}

	public nextNode(): boolean {
		assert(
			this.mode === CursorLocationType.Nodes,
			0x406 /* can only nextNode when in Nodes */,
		);
		this.index++;
		if (this.index < (this.siblings as []).length) {
			return true;
		}
		this.exitNode();
		return false;
	}

	public exitField(): void {
		// assert(this.mode === CursorLocationType.Fields, "can only navigate up from field when in field");
		this.siblings =
			this.siblingStack.pop() ?? fail(0xac3 /* Unexpected siblingStack.length */);
		this.index = this.indexStack.pop() ?? fail(0xac4 /* Unexpected indexStack.length */);
	}

	public exitNode(): void {
		// assert(this.mode === CursorLocationType.Nodes, "can only navigate up from node when in node");
		this.siblings =
			this.siblingStack.pop() ?? fail(0xac5 /* Unexpected siblingStack.length */);
		this.index = this.indexStack.pop() ?? fail(0xac6 /* Unexpected indexStack.length */);
	}

	public getNode(): TNode {
		// assert(this.mode === CursorLocationType.Nodes, "can only get node when in node");
		// Test is failing when using `?? oob()` here.
		// eslint-disable-next-line @typescript-eslint/no-non-null-assertion
		return (this.siblings as TNode[])[this.index]!;
	}

	private getField(): readonly TNode[] {
		// assert(this.mode === CursorLocationType.Fields, "can only get field when in fields");
		const parent = this.getStackedNode(this.indexStack.length - 1);
		const key: FieldKey = this.getFieldKey();
		const field = this.adapter.getFieldFromNode(parent, key);
		return field;
	}

	/**
	 * @returns the value of the current node
	 */
	public get value(): Value {
		return this.adapter.value(this.getNode());
	}

	/**
	 * @returns the type of the current node
	 */
	public get type(): TreeType {
		return this.adapter.type(this.getNode());
	}

	public get fieldIndex(): number {
		// assert(this.mode === CursorLocationType.Nodes, "can only node's index when in node");
		return this.index;
	}

	public get chunkStart(): number {
		return this.fieldIndex;
	}

	public readonly chunkLength = 1;
}

/**
 * Apply `prefix` to `path`.
 */
export function prefixPath(
	prefix: PathRootPrefix | undefined,
	path: UpPath | undefined,
): UpPath | undefined {
	if (prefix === undefined) {
		return path;
	}
	if (
		prefix.parent === undefined &&
		prefix.rootFieldOverride === undefined &&
		(prefix.indexOffset ?? 0) === 0
	) {
		return path;
	}
	return applyPrefix(prefix, path);
}

/**
 * Apply `prefix` to `path`.
 */
export function prefixFieldPath(
	prefix: PathRootPrefix | undefined,
	path: FieldUpPath,
): FieldUpPath {
	if (prefix === undefined) {
		return path;
	}
	if (
		prefix.parent === undefined &&
		prefix.rootFieldOverride === undefined &&
		(prefix.indexOffset ?? 0) === 0
	) {
		return path;
	}
	return {
		field: path.parent === undefined ? (prefix.rootFieldOverride ?? path.field) : path.field,
		parent: prefixPath(prefix, path.parent),
	};
}

/**
 * Compose two prefixes together.
 * `prefixFieldPath(root, prefixFieldPath(inner, path))` should be the same as `prefixFieldPath(prefixPathPrefix(root, inner), path))`
 *
 * TODO: tests for this.
 */
export function prefixPathPrefix(root: PathRootPrefix, inner: PathRootPrefix): PathRootPrefix {
	if (inner.parent !== undefined) {
		const composedPrefix: PathRootPrefix = {
			parent: new PrefixedPath(root, inner.parent),
			rootFieldOverride: inner.rootFieldOverride,
			indexOffset: inner.indexOffset,
		};
		return composedPrefix;
	} else {
		const composedPrefix: PathRootPrefix = {
			parent: root.parent,
			rootFieldOverride: root.rootFieldOverride ?? inner.rootFieldOverride,
			indexOffset: (inner.indexOffset ?? 0) + (root.indexOffset ?? 0),
		};
		return composedPrefix;
	}
}

function applyPrefix(prefix: PathRootPrefix, path: UpPath | undefined): UpPath | undefined {
	if (path === undefined) {
		return prefix.parent;
	} else {
		// As an optimization, avoid double wrapping paths with multiple prefixes
		if (path instanceof PrefixedPath) {
			const composedPrefix: PathRootPrefix = prefixPathPrefix(prefix, path.prefix);
			return new PrefixedPath(composedPrefix, path.path);
		} else {
			return new PrefixedPath(prefix, path);
		}
	}
}

/**
 * Wrapper around a path that adds a prefix to the root.
 *
 * Exported for testing: use `prefixPath` and `prefixFieldPath` to construct.
 */
export class PrefixedPath implements UpPath {
	public readonly parentField: FieldKey;
	public readonly parentIndex: number;
	public constructor(
		public readonly prefix: PathRootPrefix,
		public readonly path: UpPath,
	) {
		if (path.parent === undefined) {
			this.parentField = prefix.rootFieldOverride ?? path.parentField;
			this.parentIndex = path.parentIndex + (prefix.indexOffset ?? 0);
		} else {
			this.parentField = path.parentField;
			this.parentIndex = path.parentIndex;
		}
	}
	public get parent(): UpPath | undefined {
		return applyPrefix(this.prefix, this.path.parent);
	}
}
