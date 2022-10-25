/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { assert } from "@fluidframework/common-utils";
import { brand, Brand, fail } from "../util";
import { FieldKey, EmptyKey, Delta, visitDelta } from "../tree";
import { UpPath } from "./pathTree";
import { Value } from "./types";

/**
 * A way to refer to a particular tree location within a {@link Rebaser} instance's revision.
 */
export type Anchor = Brand<number, "rebaser.Anchor">;

/**
 * A singleton which represents a permanently invalid location (i.e. there is never a node there)
 */
const NeverAnchor: Anchor = brand(0);

/**
 * Maps anchors (which must be ones this locator knows about) to paths.
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
    locate(anchor: Anchor): UpPath | undefined;
}

/**
 * Collection of Anchors at a specific revision.
 *
 * See {@link Rebaser} for how to update across revisions.
 *
 * @sealed
 */
export class AnchorSet {
    /**
     * Incrementing counter to give each anchor in this set a unique index for its identifier.
     * "0" is reserved for the `NeverAnchor`.
     */
    private anchorCounter = 1;

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

    /**
     * Check if there are currently no anchors tracked.
     * Mainly for testing anchor cleanup.
     */
    public isEmpty(): boolean {
        return this.root.children.size === 0;
    }

    public locate(anchor: Anchor): UpPath | undefined {
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
     * Finds a path node if it already exists
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
     * Recursively marks the given `nodes` and their descendants as disposed and pointing to a deleted node.
     * Node that this does NOT detach the nodes.
     */
    private deepDelete(nodes: readonly PathNode[]): void {
        const stack = [...nodes];
        while (stack.length > 0) {
            // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
            const node = stack.pop()!;
            assert(node.status === Status.Alive, 0x408 /* PathNode must be alive */);
            node.status = Status.Dangling;
            for (const children of node.children.values()) {
                stack.push(...children);
            }
        }
    }

    /**
     * Updates paths for a range move (including re-parenting path items and updating indexes).
     * @param count - number of siblings to insert/delete/move.
     * @param srcStart - where the siblings are removed from. If undefined the operation is an insert.
     * @param dst - where the siblings are moved to. If undefined the operation is a delete.
     *
     * TODO:
     * How should anchors that become invalid, then valid again (ex: into content that was deleted, then undone) work?
     * Add an API to resurrect them? Store them in special detached fields? Store them in special non-detached fields?
     *
     * TODO:
     * Now should custom anchors work (ex: ones not just tied to a specific Node)?
     * This design assumes they can be expressed in terms of a Node anchor + some extra stuff,
     * but we don't have an API for the extra stuff yet.
     *
     * TODO: tests
     */
    public moveChildren(
        count: number,
        srcStart: UpPath | undefined,
        dst: UpPath | undefined,
    ): void {
        assert(
            srcStart !== undefined || dst !== undefined,
            0x352 /* moveChildren is a no-op and should not be called if there is no src or dst */,
        );

        const srcParent =
            srcStart === undefined ? undefined : this.find(srcStart.parent ?? this.root);
        // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
        const srcChildren = srcParent?.children?.get(srcStart!.parentField);
        // Sorted list of PathNodes to move from src to dst.
        let toMove: PathNode[];

        // Update src
        if (srcChildren !== undefined) {
            let numberBeforeMove = 0;
            let numberToMove = 0;
            let index = 0;
            while (
                index < srcChildren.length &&
                // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
                srcChildren[index].parentIndex < srcStart!.parentIndex
            ) {
                numberBeforeMove++;
                index++;
            }
            while (
                index < srcChildren.length &&
                // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
                srcChildren[index].parentIndex < srcStart!.parentIndex + count
            ) {
                numberToMove++;
                index++;
            }
            while (index < srcChildren.length) {
                // Fix indexes in src after moved items (subtract count).
                srcChildren[index].parentIndex -= count;
                index++;
            }
            // Sever the parent -> child connections
            toMove = srcChildren.splice(numberBeforeMove, numberToMove);
            if (srcChildren.length === 0) {
                // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
                srcParent!.afterEmptyField(srcStart!.parentField);
            }
        } else {
            toMove = [];
        }

        if (dst === undefined) {
            // Change is a delete.
            // Moved items have already been un-parented, so just mark them as deleted.
            this.deepDelete(toMove);
            return;
        }

        // Get dst (and set parent for moved items)
        let dstPath: PathNode | undefined;
        if (toMove.length > 0) {
            // There are anchors which are getting moved,
            // therefor the destination needs to be created if it does not yet exist.

            if (dst.parent !== undefined) {
                dstPath = this.trackInner(dst.parent);
            }

            // Update moved items for new parent.
            // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
            const offset = dst.parentIndex - srcStart!.parentIndex;
            for (const moved of toMove) {
                moved.parentIndex += offset;
                moved.parentPath = dstPath;
                moved.parentField = dst.parentField;
            }
        } else {
            // There are no anchors to move,
            // therefor we want to avoid creating the destination if it does not already exist.
            dstPath = this.find(dst.parent ?? this.root);
            if (dstPath !== undefined) {
                // Since we need a remove ref below to handle the `toMove.length > 0` case above,
                // add a ref here so that does not break this case.
                dstPath.addRef();
            }
        }

        // Update dst
        if (dstPath !== undefined) {
            // Update new parent to add moved children
            const field = dstPath.children.get(dst.parentField);
            if (field === undefined) {
                if (toMove.length > 0) {
                    dstPath.children.set(dst.parentField, toMove);
                }
            } else {
                // Update existing field contents
                let numberBeforeMove = 0;
                let index = 0;
                while (index < field.length && field[index].parentIndex < dst.parentIndex) {
                    numberBeforeMove++;
                    index++;
                }
                while (index < field.length) {
                    // Fix indexes in dst after moved items (add count).
                    field[index].parentIndex += count;
                    index++;
                }
                // Insert toMove items into dstPath
                // TODO: this will fail for very large numbers of anchors due to argument limits.
                field.splice(numberBeforeMove, 0, ...toMove);
            }

            dstPath.removeRef();
        }
    }

    /**
     * Updates the anchors according to the changes described in the given delta
     */
    public applyDelta(delta: Delta.Root): void {
        let parentField: FieldKey | undefined;
        let parent: UpPath | undefined;
        const moveTable = new Map<Delta.MoveId, UpPath>();

        const visitor = {
            onDelete: (start: number, count: number): void => {
                assert(parentField !== undefined, 0x3a7 /* Must be in a field to delete */);
                this.moveChildren(count, { parent, parentField, parentIndex: start }, undefined);
            },
            onInsert: (start: number, content: Delta.ProtoNode[]): void => {
                assert(parentField !== undefined, 0x3a8 /* Must be in a field to insert */);
                this.moveChildren(content.length, undefined, {
                    parent,
                    parentField,
                    parentIndex: start,
                });
            },
            onMoveOut: (start: number, count: number, id: Delta.MoveId): void => {
                assert(parentField !== undefined, 0x3a9 /* Must be in a field to move out */);
                moveTable.set(id, { parent, parentField, parentIndex: start });
            },
            onMoveIn: (start: number, count: number, id: Delta.MoveId): void => {
                assert(parentField !== undefined, 0x3aa /* Must be in a field to move in */);
                const srcPath =
                    moveTable.get(id) ?? fail("Must visit a move in after its move out");
                this.moveChildren(count, srcPath, { parent, parentField, parentIndex: start });
            },
            onSetValue: (value: Value): void => {},
            enterNode: (index: number): void => {
                assert(parentField !== undefined, 0x3ab /* Must be in a field to enter node */);
                parent = { parent, parentField, parentIndex: index };
                parentField = undefined;
            },
            exitNode: (index: number): void => {
                assert(parent !== undefined, 0x3ac /* Must have parent node */);
                parentField = parent.parentField;
                parent = parent.parent;
            },
            enterField: (key: FieldKey): void => {
                parentField = key;
            },
            exitField: (key: FieldKey): void => {
                parentField = undefined;
            },
        };

        visitDelta(delta, visitor);
    }
}

/**
 * Indicates the status of a `NodePath`.
 */
enum Status {
    /**
     * Indicates the `NodePath` is being maintained and corresponds to a valid
     * (i.e., not deleted) node in the document.
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
     * Indicates the `NodePath` corresponds to a deleted node in the document.
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
 * - Anchors are need even when not using forests, and for nodes that are outside the currently loaded part of the
 * forest.
 *
 * - Forest in general do not need to sport up pointers, but they are needed for anchors.
 *
 * Thus this can be thought of as a sparse copy of the subset of trees which are used as anchors,
 * plus the parent paths for them.
 */
class PathNode implements UpPath {
    /**
     * Number of references to this from external sources (ex: `Anchors` via `AnchorSet`.).
     *
     * PathNodes are kept as long as they have children, OR their refcount is non-zero.
     */
    private refCount = 1;

    public status: Status = Status.Alive;

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
    ) {}

    /**
     * @returns true iff this PathNode is the special root node that sits above all the detached fields.
     * In this case, the fields are detached sequences.
     * Note that the special root node should never appear in an UpPath
     * since UpPaths represent this root as `undefined`.
     */
    private isRoot(): boolean {
        return this.parentPath === undefined;
    }

    public get parent(): UpPath | undefined {
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
        this.refCount += count;
    }

    public removeRef(count = 1): void {
        assert(this.status !== Status.Disposed, 0x40b /* PathNode must not be disposed */);
        this.refCount -= count;
        if (this.refCount < 1) {
            assert(this.refCount === 0, 0x358 /* PathNode Refcount should not be negative. */);

            if (this.children.size === 0) {
                this.disposeThis();
            }
        }
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
        if (this.refCount === 0 && this.children.size === 0) {
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
        assert(this.status !== Status.Disposed, "PathNode must not be disposed");
        if (this.status === Status.Alive) {
            this.parentPath?.removeChild(this);
        }

        this.status = Status.Disposed;
    }
}
