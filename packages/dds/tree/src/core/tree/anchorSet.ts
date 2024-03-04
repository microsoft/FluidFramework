/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { assert } from "@fluidframework/core-utils";
import { createEmitter, ISubscribable } from "../../events/index.js";
import {
	brand,
	Brand,
	fail,
	Opaque,
	ReferenceCountedBase,
	BrandedKey,
	BrandedMapSubset,
	brandedSlot,
} from "../../util/index.js";
import { FieldKey } from "../schema-stored/index.js";
import {
	DetachedPlaceUpPath,
	DetachedRangeUpPath,
	PlaceIndex,
	UpPath,
	Range,
	PlaceUpPath,
	RangeUpPath,
} from "./pathTree.js";
import { Value, EmptyKey } from "./types.js";
import { PathVisitor } from "./visitPath.js";
import { DeltaVisitor } from "./visitDelta.js";
import * as Delta from "./delta.js";
import { AnnouncedVisitor } from "./visitorUtils.js";

/**
 * A way to refer to a particular tree location within an {@link AnchorSet}.
 * Associated with a ref count on the underlying {@link AnchorNode}.
 * @internal
 */
export type Anchor = Brand<number, "rebaser.Anchor">;

/**
 * A singleton which represents a permanently invalid location (i.e. there is never a node there)
 */
const NeverAnchor: Anchor = brand(0);

/**
 * Maps anchors (which must be ones this locator knows about) to paths.
 * @internal
 */
export interface AnchorLocator {
	/**
	 * Get the current location of an Anchor.
	 * The returned value should not be used after an edit has occurred.
	 *
	 * TODO: support extra/custom return types for specific/custom anchor types:
	 * for now caller must rely on data in anchor + returned node location
	 * (not ideal for anchors for places or ranges instead of nodes).
	 */
	locate(anchor: Anchor): AnchorNode | undefined;
}

/**
 * Stores arbitrary, user-defined data on an {@link Anchor}.
 * This data is preserved over the course of that anchor's lifetime.
 * @see {@link anchorSlot} for creation and an example use case.
 * @internal
 */
export type AnchorSlot<TContent> = BrandedKey<Opaque<Brand<number, "AnchorSlot">>, TContent>;

/**
 * Events for {@link AnchorNode}.
 * These events are triggered while the internal data structures are being updated.
 * Thus these events must not trigger reading of the anchorSet or forest.
 *
 * TODO:
 * - Include sub-deltas in events.
 * - Add more events.
 *
 * @internal
 */
export interface AnchorEvents {
	/**
	 * When the anchor node will never get reused by its AnchorSet.
	 * This means that the content it corresponds to has been permanently destroyed.
	 *
	 * @remarks
	 * When this happens depends entirely on how the anchorSet is used.
	 * It's possible nodes removed from the tree will be kept indefinitely, and thus never trigger this event, or they may be discarded immediately.
	 */
	afterDestroy(anchor: AnchorNode): void;

	/**
	 * One or more of the children of this node is just about to change.
	 *
	 * @remarks
	 * Does not include edits of child subtrees: instead only includes changes to nodes which are direct children in this node's fields.
	 */
	childrenChanging(anchor: AnchorNode): void;

	/**
	 * One or more of the children of this node has just changed.
	 *
	 * @remarks
	 * Does not include edits of child subtrees: instead only includes changes to nodes which are direct children in this node's fields.
	 */
	childrenChanged(anchor: AnchorNode): void;

	/**
	 * Before a change in this subtree happens.
	 *
	 * @remarks
	 * Includes edits of child subtrees.
	 */
	beforeChange(anchor: AnchorNode): void;

	/**
	 * After a change in this subtree happened.
	 *
	 * @remarks
	 * Includes edits of child subtrees.
	 */
	afterChange(anchor: AnchorNode): void;

	/**
	 * Something in this tree is changing.
	 * The event can optionally return a {@link PathVisitor} to traverse the subtree.
	 * Called on every parent (transitively) when a change is occurring.
	 * Includes changes to this node itself.
	 */
	subtreeChanging(anchor: AnchorNode): PathVisitor | void;

	/**
	 * Value on this node is changing.
	 */
	valueChanging(anchor: AnchorNode, value: Value): void;
}

/**
 * Events for {@link AnchorSet}.
 * These events are triggered while the internal data structures are being updated.
 * Thus these events must not trigger reading of the anchorSet or forest.
 *
 * TODO:
 * - Design how events should be ordered.
 * - Include sub-deltas in events.
 * - Add more events.
 *
 * @internal
 */
export interface AnchorSetRootEvents {
	/**
	 * What children are at the root is changing.
	 */
	childrenChanging(anchors: AnchorSet): void;

	/**
	 * Something in the tree is changing.
	 */
	treeChanging(anchors: AnchorSet): void;
}

/**
 * Node in a tree of anchors.
 * @internal
 */
export interface AnchorNode extends UpPath<AnchorNode>, ISubscribable<AnchorEvents> {
	/**
	 * Allows access to data stored on the Anchor in "slots".
	 * Use {@link anchorSlot} to create slots.
	 */
	readonly slots: BrandedMapSubset<AnchorSlot<any>>;

	/**
	 * Gets a child of this node.
	 *
	 * @remarks
	 * This does not return an AnchorNode since there might not be one, and lazily creating one here would have messy lifetime management (See {@link AnchorNode#getOrCreateChildRef})
	 * If an AnchorNode is required, use the AnchorSet to track then locate the returned path.
	 * TODO:
	 * Revisit this API.
	 * Perhaps if we use weak down pointers and remove ref counting, we can make this return a AnchorNode.
	 *
	 */
	child(key: FieldKey, index: number): UpPath<AnchorNode>;

	/**
	 * Gets a child AnchorNode (creating it if needed), and an Anchor owning a ref to it.
	 * Caller is responsible for freeing the returned Anchor, and must not use the AnchorNode after that.
	 */
	getOrCreateChildRef(key: FieldKey, index: number): [Anchor, AnchorNode];
}

/**
 * Define a strongly typed slot on anchors in which data can be stored.
 *
 * @remarks
 * This is mainly useful for caching data associated with a location in the tree.
 *
 * Example usage:
 * ```typescript
 * const counterSlot = anchorSlot<number>();
 *
 * function useSlot(anchor: AnchorNode): void {
 * 	anchor.slots.set(counterSlot, 1 + anchor.slots.get(counterSlot) ?? 0);
 * }
 * ```
 * @internal
 */
export function anchorSlot<TContent>(): AnchorSlot<TContent> {
	return brandedSlot<AnchorSlot<TContent>>();
}

/**
 * Collection of Anchors at a specific revision.
 *
 * See `Rebaser` for how to update across revisions.
 *
 * TODO: this should not be package exported.
 * If it's needed outside the package an Interface should be used instead which can reduce its
 * API surface to a small subset.
 *
 * @sealed
 * @internal
 */
export class AnchorSet implements ISubscribable<AnchorSetRootEvents>, AnchorLocator {
	private readonly events = createEmitter<AnchorSetRootEvents>();
	/**
	 * Incrementing counter to give each anchor in this set a unique index for its identifier.
	 * "0" is reserved for the `NeverAnchor`.
	 */
	private anchorCounter = 1;

	/**
	 * Incrementing number that is bumped each time that the {@link AnchorSet} is changed.
	 * This allows consumers to cache state associated with a particular generation number and later determine if that state may have been invalidated using a comparison with the current generation number.
	 * For example, anchor slots can be used to cache the removal status of a node to memoize repeated walks up the tree.
	 */
	public generationNumber = 0;

	/**
	 * Special root node under which all anchors in this anchor set are transitively parented.
	 * This does not appear in the UpPaths (instead they use undefined for the root).
	 * Immediate children of this root are in detached fields (which have their identifiers used as the field keys).
	 *
	 * This is allocated with refCount one, which is never freed so it is never cleaned up
	 * (as long as this AnchorSet is not garbage collected).
	 *
	 * There should never be any children other than the special root detached field under this between transactions:
	 * TODO: check for and enforce this.
	 */
	private readonly root = new PathNode(this, EmptyKey, 0, undefined);

	// TODO: anchor system could be optimized a bit to avoid the maps (Anchor is ref to Path, path has ref count).
	// For now use this more encapsulated approach with maps.
	private readonly anchorToPath: Map<Anchor, PathNode> = new Map();

	private activeVisitor?: DeltaVisitor;

	public constructor() {
		this.on("treeChanging", () => {
			this.generationNumber += 1;
		});
	}

	/**
	 * Allows access to data stored on the AnchorSet in "slots".
	 * Use {@link anchorSlot} to create slots.
	 *
	 * @privateRemarks
	 * This forwards to the slots of the special above root anchor which locate can't access.
	 */
	public get slots(): BrandedMapSubset<AnchorSlot<any>> {
		return this.root.slots;
	}

	public on<K extends keyof AnchorSetRootEvents>(
		eventName: K,
		listener: AnchorSetRootEvents[K],
	): () => void {
		return this.events.on(eventName, listener);
	}

	/**
	 * Check if there are currently no anchors tracked.
	 * Mainly for testing anchor cleanup.
	 */
	public isEmpty(): boolean {
		return this.root.children.size === 0;
	}

	public locate(anchor: Anchor): AnchorNode | undefined {
		if (anchor === NeverAnchor) {
			return undefined;
		}

		const path = this.anchorToPath.get(anchor);
		assert(path !== undefined, 0x3a6 /* Cannot locate anchor which is not in this AnchorSet */);
		return path.status === Status.Alive ? path : undefined;
	}

	public forget(anchor: Anchor): void {
		if (anchor !== NeverAnchor) {
			const path = this.anchorToPath.get(anchor);
			assert(path !== undefined, 0x351 /* cannot forget unknown Anchor */);
			path.removeRef();
			this.anchorToPath.delete(anchor);
		}
	}

	/**
	 * TODO: Add APIs need to allow callers of this function to reduce copying here.
	 * Ex: maybe return something extending UpPath here.
	 * @param path - the path to the node to be tracked. If null, returns an anchor
	 * which is permanently invalid.
	 */
	// eslint-disable-next-line @rushstack/no-new-null
	public track(path: UpPath | null): Anchor {
		if (path === null) {
			return NeverAnchor;
		}

		const foundPath = this.trackInner(path);
		const anchor: Anchor = brand(this.anchorCounter++);
		this.anchorToPath.set(anchor, foundPath);
		return anchor;
	}

	/**
	 * Finds a path node, creating if needed, and adds a ref count to it.
	 */
	private trackInner(path: UpPath): PathNode {
		if (path instanceof PathNode && path.anchorSet === this) {
			path.addRef();
			return path;
		}
		const parent = path.parent ?? this.root;
		const parentPath = this.trackInner(parent);

		const child = parentPath.getOrCreateChild(path.parentField, path.parentIndex);

		// Now that child is added (if needed), remove the extra ref that we added in the recursive call.
		parentPath.removeRef();

		return child;
	}

	/**
	 * Finds a path node if it already exists.
	 */
	private find(path: UpPath): PathNode | undefined {
		if (path instanceof PathNode) {
			if (path.anchorSet === this) {
				return path;
			}
		}
		const parent = path.parent ?? this.root;
		const parentPath = this.find(parent);
		return parentPath?.tryGetChild(path.parentField, path.parentIndex);
	}

	/**
	 * Returns an equivalent path making as much of it with PathNodes as possible.
	 * This allows future operations (like find, track, locate) on this path (and derived ones) to be faster.
	 * Note that the returned path may use AnchorNodes from this AnchorSet,
	 * but does not have a tracked reference to them, so this should not be held onto across anything that might free an AnchorNode.
	 *
	 * @remarks
	 * Also ensures that any PathNode in the path is from this AnchorSet.
	 */
	public internalizePath(originalPath: UpPath): UpPath {
		let path: UpPath | undefined = originalPath;
		const stack: UpPath[] = [];
		while (path !== undefined) {
			if (path instanceof PathNode && path.anchorSet === this) {
				break;
			}
			stack.push(path);
			path = path.parent;
		}

		// Now `path` contains an internalized path.
		// It just needs the paths from stackOut to wrap it.

		let wrapWith: UpPath | undefined;
		while ((wrapWith = stack.pop()) !== undefined) {
			if (path === undefined || path instanceof PathNode) {
				// If path already has an anchor, get an anchor for it's child if there is one:
				const child = (path ?? this.root).tryGetChild(
					wrapWith.parentField,
					wrapWith.parentIndex,
				);
				if (child !== undefined) {
					path = child;
					continue;
				}
			}
			// Replacing this if with a ternary makes the documentation harder to include and hurts readability.
			// eslint-disable-next-line unicorn/prefer-ternary
			if (path === wrapWith.parent && !(wrapWith instanceof PathNode)) {
				// path is safe to reuse from input path, so use it to avoid allocating another object.
				path = wrapWith;
			} else {
				path = {
					parent: path,
					parentField: wrapWith.parentField,
					parentIndex: wrapWith.parentIndex,
				};
			}
		}

		return path ?? fail("internalize path must be a path");
	}

	/**
	 * Recursively marks the given `nodes` and their descendants as disposed and pointing to a deleted node.
	 * Note that this does NOT detach the nodes.
	 */
	private deepDelete(nodes: readonly PathNode[]): void {
		const stack = [...nodes];
		while (stack.length > 0) {
			// eslint-disable-next-line @typescript-eslint/no-non-null-assertion
			const node = stack.pop()!;
			assert(node.status === Status.Alive, 0x408 /* PathNode must be alive */);
			node.status = Status.Dangling;
			node.events.emit("afterDestroy", node);
			for (const children of node.children.values()) {
				stack.push(...children);
			}
		}
	}

	/**
	 * Decouple nodes from their parent.
	 * This removes the reference from the parent to the decoupled children, and updates the indexes of the remaining children accordingly.
	 * This does NOT update the decoupled children: both their index and parent are left at their existing values.
	 * To decouple and fixup the children, see `removeChildren` and `moveChildren`.
	 * @param startPath - The path to the first node that is being decoupled.
	 * @param count - number of siblings that are decoupled from the original tree.
	 *
	 * TODO: tests
	 */
	private decoupleNodes(startPath: UpPath, count: number): PathNode[] {
		assert(count > 0, 0x681 /* count must be positive */);

		const sourceParent = this.find(startPath.parent ?? this.root);
		const sourceChildren = sourceParent?.children?.get(startPath.parentField);
		let nodes: PathNode[] = [];

		if (sourceChildren !== undefined) {
			let numberBeforeDecouple = 0;
			let numberToDecouple = 0;
			let index = 0;
			while (
				index < sourceChildren.length &&
				sourceChildren[index].parentIndex < startPath.parentIndex
			) {
				numberBeforeDecouple++;
				index++;
			}
			while (
				index < sourceChildren.length &&
				sourceChildren[index].parentIndex < startPath.parentIndex + count
			) {
				numberToDecouple++;
				index++;
			}
			while (index < sourceChildren.length) {
				// Fix indexes in source after moved items (subtract count).
				sourceChildren[index].parentIndex -= count;
				index++;
			}
			// Sever the parent -> child connections
			nodes = sourceChildren.splice(numberBeforeDecouple, numberToDecouple);
			if (sourceChildren.length === 0) {
				// eslint-disable-next-line @typescript-eslint/no-non-null-assertion
				sourceParent!.afterEmptyField(startPath.parentField);
			}
		}

		return nodes;
	}

	/**
	 * Couple nodes to a parent.
	 * @param destination - where the siblings are coupled to.
	 * @param count - number of siblings that are coupled in the original tree.
	 * @param coupleInfo - this object contains the nodes to couple and the parent index of the first node that is coupled in the original tree.
	 *
	 * TODO: tests
	 */
	private coupleNodes(
		destination: UpPath,
		count: number,
		coupleInfo: { startParentIndex: number; nodes: PathNode[] },
	): void {
		assert(coupleInfo.nodes.length > 0, 0x682 /* coupleInfo must have nodes to couple */);

		// The destination needs to be created if it does not exist yet.
		const destinationPath = this.trackInner(destination.parent ?? this.root);

		// Update nodes for new parent.
		for (const node of coupleInfo.nodes) {
			node.parentIndex += destination.parentIndex - coupleInfo.startParentIndex;
			node.parentPath = destinationPath;
			node.parentField = destination.parentField;
		}

		// Update new parent to add children
		const field = destinationPath.children.get(destination.parentField);
		if (field === undefined) {
			destinationPath.children.set(destination.parentField, coupleInfo.nodes);
		} else {
			// Update existing field contents
			const numberBeforeCouple = this.increaseParentIndexes(
				field,
				destination.parentIndex,
				count,
			);

			// TODO: this will fail for very large numbers of anchors due to argument limits.
			field.splice(numberBeforeCouple, 0, ...coupleInfo.nodes);
		}

		destinationPath.removeRef();
	}

	/**
	 * Updates the parent indexes within `field` to account for `count` children being inserted at `fromParentIndex`. Note that
	 * `fromParentIndex` is the logical position within the field, not the index with the sparse PathNode array.
	 *
	 * @param field - the field to update.
	 * @param fromParentIndex - the logical index within the field to start updating from.
	 * @param count - the number to increase parent indexes.
	 * @returns the number of items in the field that are not increased.
	 *
	 * TODO: tests
	 */
	private increaseParentIndexes(
		field: PathNode[],
		fromParentIndex: number,
		count: number,
	): number {
		let index = 0;
		while (index < field.length && field[index].parentIndex < fromParentIndex) {
			index++;
		}
		const numberBeforeIncrease = index;
		while (index < field.length) {
			field[index].parentIndex += count;
			index++;
		}

		return numberBeforeIncrease;
	}

	/**
	 * Updates paths for a range move (including re-parenting path items and updating indexes).
	 * @param sourceStart - where the siblings are removed from.
	 * @param destination - where the siblings are moved to.
	 * @param count - number of siblings to move.
	 *
	 * TODO:
	 * How should anchors that become invalid, then valid again (ex: into content that was deleted, then undone) work?
	 * Add an API to resurrect them? Store them in special detached fields? Store them in special non-detached fields?
	 *
	 * TODO:
	 * How should custom anchors work (ex: ones not just tied to a specific Node)?
	 * This design assumes they can be expressed in terms of a Node anchor + some extra stuff,
	 * but we don't have an API for the extra stuff yet.
	 *
	 * TODO: tests
	 */
	private moveChildren(sourceStart: UpPath, destination: UpPath, count: number): void {
		const nodes = this.decoupleNodes(sourceStart, count);
		if (nodes.length > 0) {
			this.coupleNodes(destination, count, {
				startParentIndex: sourceStart.parentIndex,
				nodes,
			});
		} else {
			// If there are no nodes to move, we still need to update the parent indexes of the nodes
			// affected in the move in.
			this.offsetChildren(destination, count);
		}
	}

	private removeChildren(path: UpPath, count: number) {
		const nodes = this.decoupleNodes(path, count);
		this.deepDelete(nodes);
	}

	/**
	 * Updates the parent indexes of all the nodes located at right side of the given path by the given offset.
	 * @param firstSiblingToOffset - the path to offset children of.
	 * @param offset - the offset to apply to the children.
	 *
	 */
	private offsetChildren(firstSiblingToOffset: UpPath, offset: number) {
		const nodePath = this.find(firstSiblingToOffset.parent ?? this.root);
		const field = nodePath?.children.get(firstSiblingToOffset.parentField);
		if (field !== undefined) {
			this.increaseParentIndexes(field, firstSiblingToOffset.parentIndex, offset);
		}
	}

	/**
	 * Provides a visitor that can be used to mutate this {@link AnchorSet}.
	 *
	 * @returns A visitor that can be used to mutate this {@link AnchorSet}.
	 *
	 * @remarks
	 * Mutating the {@link AnchorSet} does NOT update the forest.
	 * The visitor must be released after use by calling {@link DeltaVisitor.free} on it.
	 * It is invalid to acquire a visitor without releasing the previous one,
	 * and this method will throw an error if this is attempted.
	 */
	public acquireVisitor(): AnnouncedVisitor & DeltaVisitor {
		assert(
			this.activeVisitor === undefined,
			0x767 /* Must release existing visitor before acquiring another */,
		);

		const visitor = {
			anchorSet: this,
			// Run `withNode` on anchorNode for parent if there is such an anchorNode.
			// If at root, run `withRoot` instead.
			maybeWithNode(withNode: (anchorNode: PathNode) => void, withRoot?: () => void) {
				if (this.parent === undefined && withRoot !== undefined) {
					withRoot();
				} else {
					assert(this.parent !== undefined, 0x5b0 /* parent must exist */);
					// TODO:Perf:
					// When traversing to a depth D when there are not anchors in that subtree, this goes O(D^2).
					// Delta traversal should early out in this case because no work is needed (and all move outs are known to not contain anchors).
					this.parent = this.anchorSet.internalizePath(this.parent);
					if (this.parent instanceof PathNode) {
						withNode(this.parent);
					}
				}
			},
			// Run `withNode` on every node from the current `this.parent` to the root.
			// Should only be called when in a field.
			withParentNodeUpToRoot(withNode: (anchorNode: PathNode) => void) {
				assert(
					this.parentField !== undefined,
					0x7cd /* Must be in a field to call withNodeUpToRoot */,
				);
				// This function gets called when we attach a node to the root field, in which case there is no parent.
				// It's expected this will do nothing in that case.
				let currentParent: UpPath | undefined = this.parent;
				while (currentParent !== undefined) {
					if (currentParent instanceof PathNode) {
						withNode(currentParent);
					}
					currentParent = currentParent.parent;
				}
			},
			// Lookup table for path visitors collected from {@link AnchorEvents.visitSubtreeChanging} emitted events.
			// The key is the path of the node that the visitor is registered on. The code ensures that the path visitor visits only the appropriate subtrees
			// by maintaining the mapping only during time between the {@link DeltaVisitor.enterNode} and {@link DeltaVisitor.exitNode} calls for a given anchorNode.
			pathVisitors: new Map<PathNode, Set<PathVisitor>>(),
			parentField: undefined as FieldKey | undefined,
			parent: undefined as UpPath | undefined,
			free() {
				assert(
					this.anchorSet.activeVisitor !== undefined,
					0x768 /* Multiple free calls for same visitor */,
				);
				this.anchorSet.activeVisitor = undefined;
			},
			notifyChildrenChanging(): void {
				this.maybeWithNode(
					(p) => p.events.emit("childrenChanging", p),
					() => this.anchorSet.events.emit("childrenChanging", this.anchorSet),
				);
			},
			notifyChildrenChanged(): void {
				this.maybeWithNode(
					(p) => p.events.emit("childrenChanged", p),
					() => {},
				);
			},
			beforeAttach(source: FieldKey, count: number, destination: PlaceIndex): void {
				assert(
					this.parentField !== undefined,
					0x7a0 /* Must be in a field in order to attach */,
				);
				const destinationPath: PlaceUpPath = {
					parent: this.parent,
					field: this.parentField,
					index: destination,
				};
				const sourcePath: DetachedRangeUpPath = brand({
					field: source,
					start: 0,
					end: count,
				});
				this.withParentNodeUpToRoot((p) => {
					p.events.emit("beforeChange", p);
				});
				for (const visitors of this.pathVisitors.values()) {
					for (const pathVisitor of visitors) {
						pathVisitor.beforeAttach(sourcePath, destinationPath);
					}
				}
			},
			afterAttach(source: FieldKey, destination: Range): void {
				assert(
					this.parentField !== undefined,
					0x7a1 /* Must be in a field in order to attach */,
				);
				const sourcePath: DetachedPlaceUpPath = brand({
					field: source,
					index: 0,
				});
				const destinationPath: RangeUpPath = {
					parent: this.parent,
					field: this.parentField,
					...destination,
				};
				this.withParentNodeUpToRoot((p) => {
					p.events.emit("afterChange", p);
				});
				for (const visitors of this.pathVisitors.values()) {
					for (const pathVisitor of visitors) {
						pathVisitor.afterAttach(sourcePath, destinationPath);
					}
				}
			},
			attach(source: FieldKey, count: number, destination: PlaceIndex): void {
				this.notifyChildrenChanging();
				this.attachEdit(source, count, destination);
				this.notifyChildrenChanged();
			},
			attachEdit(source: FieldKey, count: number, destination: PlaceIndex): void {
				assert(
					this.parentField !== undefined,
					0x7a2 /* Must be in a field in order to attach */,
				);
				const sourcePath = {
					parent: this.anchorSet.root,
					parentField: source,
					parentIndex: 0,
				};
				const destinationPath = {
					parent: this.parent,
					parentField: this.parentField,
					parentIndex: destination,
				};
				this.anchorSet.moveChildren(sourcePath, destinationPath, count);
			},
			beforeDetach(source: Range, destination: FieldKey): void {
				assert(
					this.parentField !== undefined,
					0x7a3 /* Must be in a field in order to attach */,
				);
				const sourcePath: RangeUpPath = {
					parent: this.parent,
					field: this.parentField,
					...source,
				};
				const destinationPath: DetachedPlaceUpPath = brand({
					field: destination,
					index: 0,
				});
				this.withParentNodeUpToRoot((p) => {
					p.events.emit("beforeChange", p);
				});
				for (const visitors of this.pathVisitors.values()) {
					for (const pathVisitor of visitors) {
						pathVisitor.beforeDetach(sourcePath, destinationPath);
					}
				}
			},
			afterDetach(source: PlaceIndex, count: number, destination: FieldKey): void {
				assert(
					this.parentField !== undefined,
					0x7a4 /* Must be in a field in order to attach */,
				);
				const sourcePath: PlaceUpPath = {
					parent: this.parent,
					field: this.parentField,
					index: source,
				};
				const destinationPath: DetachedRangeUpPath = brand({
					field: destination,
					start: 0,
					end: count,
				});
				this.withParentNodeUpToRoot((p) => {
					p.events.emit("afterChange", p);
				});
				for (const visitors of this.pathVisitors.values()) {
					for (const pathVisitor of visitors) {
						pathVisitor.afterDetach(sourcePath, destinationPath);
					}
				}
			},
			detach(source: Range, destination: FieldKey): void {
				this.notifyChildrenChanging();
				this.detachEdit(source, destination);
				this.notifyChildrenChanged();
			},
			detachEdit(source: Range, destination: FieldKey): void {
				assert(
					this.parentField !== undefined,
					0x7a5 /* Must be in a field in order to detach */,
				);
				const sourcePath = {
					parent: this.parent,
					parentField: this.parentField,
					parentIndex: source.start,
				};
				const destinationPath = {
					parent: this.anchorSet.root,
					parentField: destination,
					parentIndex: 0,
				};
				this.anchorSet.moveChildren(sourcePath, destinationPath, source.end - source.start);
			},
			beforeReplace(newContent: FieldKey, oldContent: Range, destination: FieldKey): void {
				assert(
					this.parentField !== undefined,
					0x7a6 /* Must be in a field in order to replace */,
				);
				const oldContentPath: RangeUpPath = {
					parent: this.parent,
					field: this.parentField,
					...oldContent,
				};
				const newNodesSourcePath: DetachedRangeUpPath = brand({
					field: newContent,
					start: 0,
					end: oldContent.end - oldContent.start,
				});
				const oldNodesDestinationPath: DetachedPlaceUpPath = brand({
					field: destination,
					index: 0,
				});
				this.withParentNodeUpToRoot((p) => {
					p.events.emit("beforeChange", p);
				});
				for (const visitors of this.pathVisitors.values()) {
					for (const pathVisitor of visitors) {
						pathVisitor.beforeReplace(
							newNodesSourcePath,
							oldContentPath,
							oldNodesDestinationPath,
						);
					}
				}
			},
			afterReplace(
				newContentSource: FieldKey,
				newContent: Range,
				oldContent: FieldKey,
			): void {
				assert(
					this.parentField !== undefined,
					0x7a7 /* Must be in a field in order to replace */,
				);
				const newContentPath: RangeUpPath = {
					parent: this.parent,
					field: this.parentField,
					...newContent,
				};
				const newNodesSourcePath: DetachedPlaceUpPath = brand({
					field: newContentSource,
					index: 0,
				});
				const oldNodesDestinationPath: DetachedRangeUpPath = brand({
					field: oldContent,
					start: 0,
					end: newContent.end - newContent.start,
				});
				this.withParentNodeUpToRoot((p) => {
					p.events.emit("afterChange", p);
				});
				for (const visitors of this.pathVisitors.values()) {
					for (const pathVisitor of visitors) {
						pathVisitor.afterReplace(
							newNodesSourcePath,
							newContentPath,
							oldNodesDestinationPath,
						);
					}
				}
			},
			replace(
				newContentSource: FieldKey,
				range: Range,
				oldContentDestination: FieldKey,
			): void {
				this.notifyChildrenChanging();
				this.detachEdit(range, oldContentDestination);
				this.attachEdit(newContentSource, range.end - range.start, range.start);
				this.notifyChildrenChanged();
			},
			destroy(detachedField: FieldKey, count: number): void {
				this.anchorSet.removeChildren(
					{
						parent: undefined,
						parentField: detachedField,
						parentIndex: 0,
					},
					count,
				);
			},
			beforeDestroy(detachedField: FieldKey, count: number): void {
				const range: DetachedRangeUpPath = brand({
					field: detachedField,
					start: 0,
					end: count,
				});
				for (const visitors of this.pathVisitors.values()) {
					for (const pathVisitor of visitors) {
						pathVisitor.beforeDestroy(range);
					}
				}
			},
			create(content: Delta.ProtoNodes, destination: FieldKey): void {
				// Nothing to do since content can only be created in a new detached field,
				// which cannot contain any anchors.
			},
			afterCreate(content: Delta.ProtoNodes, destination: FieldKey): void {
				for (const visitors of this.pathVisitors.values()) {
					for (const pathVisitor of visitors) {
						const rangePath: DetachedRangeUpPath = brand({
							field: destination,
							start: 0,
							end: content.length,
						});
						pathVisitor.afterCreate(rangePath);
					}
				}
			},
			enterNode(index: number): void {
				assert(
					this.parentField !== undefined,
					0x3ab /* Must be in a field to enter node */,
				);

				this.parent = {
					parent: this.parent,
					parentField: this.parentField,
					parentIndex: index,
				};
				this.parentField = undefined;
				this.maybeWithNode((p) => {
					// avoid multiple pass side-effects
					if (!this.pathVisitors.has(p)) {
						const visitors: (PathVisitor | void)[] = p.events.emitAndCollect(
							"subtreeChanging",
							p,
						);
						if (visitors.length > 0) {
							this.pathVisitors.set(
								p,
								new Set(visitors.filter((v): v is PathVisitor => v !== undefined)),
							);
						}
					}
				});
			},
			exitNode(index: number): void {
				assert(this.parent !== undefined, 0x3ac /* Must have parent node */);
				this.maybeWithNode((p) => {
					// Remove subtree path visitors added at this node if there are any
					this.pathVisitors.delete(p);
				});
				const parent = this.parent;
				this.parentField = parent.parentField;
				this.parent = parent.parent;
			},
			enterField(key: FieldKey): void {
				this.parentField = key;
			},
			exitField(key: FieldKey): void {
				this.parentField = undefined;
			},
		};
		this.events.emit("treeChanging", this);
		this.activeVisitor = visitor;
		return visitor;
	}
}

/**
 * Indicates the status of a `NodePath`.
 */
enum Status {
	/**
	 * Indicates the `NodePath` is being maintained and corresponds to a valid
	 * (i.e., not removed) node in the document.
	 */
	Alive,
	/**
	 * Indicates the `NodePath` is not being maintained by the `AnchorSet`.
	 * The `NodePath` may or may not correspond to a valid node in the document.
	 *
	 * Accessing such a node is invalid.
	 * Nodes in this state are retained to detect use-after-free bugs.
	 */
	Disposed,
	/**
	 * Indicates the `NodePath` corresponds to a removed node in the document.
	 * Such `NodePath`s are not maintained by the `AnchorSet` (other than updating
	 * their status to `Disposed` when appropriate).
	 *
	 * Accessing such a node is invalid.
	 * Nodes in this state are retained to detect use-after-free bugs.
	 */
	Dangling,
}

/**
 * Tree of anchors.
 *
 * Contains both child and parent pointers, which are kept in sync.
 *
 * Each anchor is equivalent to a path through the tree.
 * This tree structure stores a collection of these paths, but deduplicating the common prefixes of the tree
 * prefix-tree style.
 *
 * These anchors are used instead of just holding onto the node objects in forests for several reasons:
 *
 * - Update policy might be more complex than just tracking a node object in the forest.
 *
 * - Not all forests will have node objects: some may use compressed binary formats with no objects to reference.
 *
 * - Anchors are needed even when not using forests, and for nodes that are outside the currently loaded part of the
 * forest.
 *
 * - Forest in general do not need to support up pointers, but they are needed for anchors.
 *
 * Thus this can be thought of as a sparse copy of the subset of trees which are used as anchors,
 * plus the parent paths for them.
 *
 * ReferenceCountedBase tracks the number of references to this from external sources (`Anchors` via `AnchorSet`.).
 * Kept alive as if any of the follow are true:
 * 1. there are children.
 * 2. refcount is non-zero.
 * 3. events are registered.
 */
class PathNode extends ReferenceCountedBase implements UpPath<PathNode>, AnchorNode {
	public status: Status = Status.Alive;
	/**
	 * Event emitter for this anchor.
	 */
	public readonly events = createEmitter<AnchorEvents>(() => this.considerDispose());

	/**
	 * PathNode arrays are kept sorted the PathNode's parentIndex for efficient search.
	 * Users of this field must take care to maintain invariants (correct parent pointers, not empty child arrays etc.)
	 *
	 * Performance Note:
	 * Large child lists could be updated more efficiently here using a data-structure optimized
	 * for efficient prefix sum updates, such as a Fenwick tree or Finger tree.
	 * This would be complicated by the need for parent pointers (including indexes),
	 * but is possible to do.
	 */
	public readonly children: Map<FieldKey, PathNode[]> = new Map();

	public readonly slots: BrandedMapSubset<AnchorSlot<any>> = new Map();

	/**
	 * Construct a PathNode with refcount 1.
	 * @param anchorSet - used to determine if this PathNode is already part of a specific anchorSet
	 * to early out UpPath walking.
	 */
	public constructor(
		public readonly anchorSet: AnchorSet,
		public parentField: FieldKey,
		public parentIndex: number,
		/**
		 * The parent of this `PathNode` (an up pointer in the `PathNode` tree).
		 * If the status of this node is `Alive`, then there must be a corresponding down pointer from the
		 * `parentPath` node to this node.
		 * When undefined, this node is the {@link AnchorSet.root} for `this.anchorSet` and thus has no parent.
		 *
		 * When updating the tree, `AnchorSet` may transiently leave the up and down pointers inconsistent
		 * (updating down pointers first), but must ensure they are consistent before the editing operation returns
		 * to non-`AnchorSet` code.
		 * This consistency guarantee only applies to nodes that are `Alive`.
		 */
		public parentPath: PathNode | undefined,
	) {
		super(1);
	}

	public on<K extends keyof AnchorEvents>(eventName: K, listener: AnchorEvents[K]): () => void {
		return this.events.on(eventName, listener);
	}

	public child(key: FieldKey, index: number): UpPath<AnchorNode> {
		// Fast path: if child exists, return it.
		return (
			this.tryGetChild(key, index) ?? { parent: this, parentField: key, parentIndex: index }
		);
	}

	public getOrCreateChildRef(key: FieldKey, index: number): [Anchor, AnchorNode] {
		const anchor = this.anchorSet.track(this.child(key, index));
		const node =
			this.anchorSet.locate(anchor) ?? fail("cannot reference child that does not exist");
		return [anchor, node];
	}

	/**
	 * @returns true iff this PathNode is the special root node that sits above all the detached fields.
	 * In this case, the fields are detached sequences.
	 * Note that the special root node should never appear in an UpPath
	 * since UpPaths represent this root as `undefined`.
	 */
	private isRoot(): boolean {
		return this.parentPath === undefined;
	}

	public get parent(): PathNode | undefined {
		assert(this.status !== Status.Disposed, 0x409 /* PathNode must not be disposed */);
		assert(
			this.parentPath !== undefined,
			0x355 /* PathNode.parent is an UpPath API and thus should never be called on the root PathNode. */,
		);
		// Root PathNode corresponds to the undefined root for UpPath API.
		if (this.parentPath.isRoot()) {
			return undefined;
		}
		return this.parentPath;
	}

	public addRef(count = 1): void {
		assert(this.status === Status.Alive, 0x40a /* PathNode must be alive */);
		this.referenceAdded(count);
	}

	public removeRef(count = 1): void {
		assert(this.status !== Status.Disposed, 0x40b /* PathNode must not be disposed */);
		this.referenceRemoved(count);
	}

	// Called when refcount is set to 0.
	// Node may be kept alive by children or events after this point.
	protected dispose(): void {
		this.considerDispose();
	}

	/**
	 * Gets a child, adding a ref to it.
	 * Creates child (with 1 ref) if needed.
	 */
	public getOrCreateChild(key: FieldKey, index: number): PathNode {
		assert(this.status === Status.Alive, 0x40c /* PathNode must be alive */);
		let field = this.children.get(key);
		if (field === undefined) {
			field = [];
			this.children.set(key, field);
		}
		// TODO: should do more optimized search (ex: binary search).
		let child = field.find((c) => c.parentIndex === index);
		if (child === undefined) {
			child = new PathNode(this.anchorSet, key, index, this);
			field.push(child);
			// Keep list sorted by index.
			field.sort((a, b) => a.parentIndex - b.parentIndex);
		} else {
			child.addRef();
		}
		return child;
	}

	/**
	 * Gets a child if it exists.
	 * Does NOT add a ref.
	 */
	public tryGetChild(key: FieldKey, index: number): PathNode | undefined {
		assert(this.status === Status.Alive, 0x40d /* PathNode must be alive */);
		const field = this.children.get(key);

		// TODO: should do more optimized search (ex: binary search or better) using index.
		return field?.find((c) => c.parentIndex === index);
	}

	/**
	 * Removes reference from this to `child`.
	 * Since PathNodes are doubly linked,
	 * the caller must ensure that the reference from child to parent is also removed (or the child is no longer used).
	 */
	public removeChild(child: PathNode): void {
		assert(this.status === Status.Alive, 0x40e /* PathNode must be alive */);
		const key = child.parentField;
		const field = this.children.get(key);
		// TODO: should do more optimized search (ex: binary search or better) using child.parentIndex()
		// Note that this is the index in the list of child paths, not the index within the field
		const childIndex = field?.indexOf(child) ?? -1;
		assert(childIndex !== -1, 0x35c /* child must be parented to be removed */);
		field?.splice(childIndex, 1);
		if (field?.length === 0) {
			this.afterEmptyField(key);
		}
	}

	/**
	 * Call this after directly editing the child array for a field to be empty.
	 * Handles cleaning up unneeded data
	 * (like the field in the map, and possibly this entire PathNode and its parents if they are no longer needed.)
	 */
	public afterEmptyField(key: FieldKey): void {
		assert(this.status === Status.Alive, 0x40f /* PathNode must be alive */);
		this.children.delete(key);
		this.considerDispose();
	}

	/**
	 * If node is no longer needed (has no references, no children and no events):
	 * removes this from parent if alive, and sets this to disposed.
	 * Must only be called when .
	 *
	 * Allowed when dangling (but not when disposed).
	 */
	private considerDispose(): void {
		assert(this.status !== Status.Disposed, 0x41d /* PathNode must not be disposed */);
		if (this.isUnreferenced() && this.children.size === 0 && !this.events.hasListeners()) {
			if (this.status === Status.Alive) {
				this.parentPath?.removeChild(this);
			}
			this.status = Status.Disposed;
		}
	}
}
