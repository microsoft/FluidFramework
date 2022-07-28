/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { assert } from "@fluidframework/common-utils";
import { brand, Brand } from "../util";
import { FieldKey, EmptyKey } from "../tree";
import { UpPath } from "./pathTree";

/**
 * A way to refer to a particular tree location within a {@link Rebaser} instance's revision.
 */
export type Anchor = Brand<number, "rebaser.Anchor">;

/**
 * Collection of Anchors at a specific revision.
 *
 * See {@link Rebaser} for how to update across revisions.
 */
export class AnchorSet {
    // Incrementing counter to give each anchor in this set a unique index for its identifier.
    private anchorCounter = 0;
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

    /**
     * Get the current location of an Anchor.
     * The returned value should not be used after an edit has occurred.
     *
     * TODO: support extra/custom return types for specific/custom anchor types:
     * for now caller must rely on data in anchor + returned node location
     * (not ideal for anchors for places or ranges instead of nodes).
     */
    public locate(anchor: Anchor): UpPath | undefined {
        // TODO: this should error for anchors that do not exist,
        // and return undefined only if anchor does exist, but points nowhere in current revision.
        return this.anchorToPath.get(anchor);
    }

    public forget(anchor: Anchor): void {
        const path = this.anchorToPath.get(anchor);
        assert(path !== undefined, "cannot forget unknown Anchor");
        path.removeRef();
        this.anchorToPath.delete(anchor);
    }

    /**
     * TODO: Add APIs need to allow callers of this function to reduce copying here.
     * Ex: maybe return something extending UpPath here.
     */
    public track(path: UpPath): Anchor {
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

        const child = parentPath.getOrCreateChild(
            path.parentField,
            path.parentIndex,
        );

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
     * Updates paths for a range move (including re-parenting path items and updating indexes).
     * @param count - number of siblings to insert/delete/move.
     * @param src - where the siblings are removed from. If undefined the operation is an insert.
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
        src: undefined | { path: UpPath; field: FieldKey; start: number; },
        dst: undefined | { path: UpPath; field: FieldKey; start: number; },
    ): void {
        assert(
            src !== undefined || dst !== undefined,
            "moveChildren is a no-op and should not be called if there is no src or dst",
        );

        const srcParent = src === undefined ? undefined : this.find(src.path);
        // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
        const srcChildren = srcParent?.children?.get(src!.field);
        // Sorted list of PathNodes to move from src to dst.
        let toMove: PathNode[];

        // Update src
        if (srcChildren !== undefined) {
            let numberBeforeMove = 0;
            let numberToMove = 0;
            let index = 0;
            // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
            while (index < srcChildren.length && srcChildren[index].parentIndex < src!.start) {
                numberBeforeMove++;
                index++;
            }
            // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
            while (index < srcChildren.length && srcChildren[index].parentIndex < src!.start + count) {
                numberToMove++;
                index++;
            }
            while (index < srcChildren.length) {
                // Fix indexes in src after moved items (subtract count).
                srcChildren[index].parentIndex -= count;
                index++;
            }
            toMove = srcChildren.splice(numberBeforeMove, numberToMove);
            if (srcChildren.length === 0) {
                // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
                srcParent!.afterEmptyField(src!.field);
            }
        } else {
            toMove = [];
        }

        if (dst === undefined) {
            // Change is a delete.
            // Moved items have already been un-parented, so just mark them as deleted.
            for (const moved of toMove) {
                assert(!moved.deleted, "PathNode must not be deleted");
                moved.deleted = true;
            }
            return;
        }

        // Get dst (and set parent for moved items)
        let dstPath: PathNode | undefined;
        if (toMove.length > 0) {
            // There are anchors which are getting moved,
            // therefor the destination needs to be created if it does not yet exist.
            dstPath = this.trackInner(dst.path);

            // Update moved items for new parent.
            // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
            const offset = dst.start - src!.start;
            for (const moved of toMove) {
                moved.parentIndex += offset;
                moved.parentPath = dstPath;
                moved.parentField = dst.field;
            }
        } else {
            // There are no anchors to move,
            // therefor we want to avoid creating the destination if it does not already exist.
            dstPath = this.find(dst.path);
            if (dstPath !== undefined) {
                // Since we need a remove ref below to handle the `toMove.length > 0` case above,
                // add a ref here so that does not break this case.
                dstPath.addRef();
            }
        }

        // Update dst
        if (dstPath !== undefined) {
            // Update new parent to add moved children
            const field = dstPath.children.get(dst.field);
            if (field === undefined) {
                if (toMove.length > 0) {
                    dstPath.children.set(dst.field, toMove);
                }
            } else {
                // Update existing field contents
                let numberBeforeMove = 0;
                let index = 0;
                while (index < field.length && field[index].parentIndex < dst.start) {
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
 * - Update policy might be more complex than just tracking a node object in the forest.
 * - Not all forests will have node objects: some may use compressed binary formats with no objects to reference.
 * - Anchors are need even when not using forests,
 *      and for nodes that are outside the currently loaded part of the forest.
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

    public deleted = false;

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
        assert(!this.deleted, "PathNode must not be deleted");
        assert(
            this.parentPath !== undefined,
            "PathNode.parent is an UpPath API and thus should never be called on the root PathNode.",
        );
        // Root PathNode corresponds to the undefined root for UpPath API.
        if (this.parentPath.isRoot()) {
            return undefined;
        }
        return this.parentPath;
    }

    public addRef(count = 1): void {
        assert(!this.deleted, "PathNode must not be deleted");
        this.refCount += count;
    }

    public removeRef(count = 1): void {
        assert(!this.deleted, "PathNode must not be deleted");
        this.refCount -= count;
        if (this.refCount < 1) {
            assert(
                this.refCount === 0,
                "PathNode Refcount should not be negative.",
            );

            if (this.children.size === 0) {
                this.deleteThis();
            }
        }
    }

    /**
     * Gets a child, adding a ref to it.
     * Creates child (with 1 ref) if needed.
     */
    public getOrCreateChild(key: FieldKey, index: number): PathNode {
        assert(!this.deleted, "PathNode must not be deleted");
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
        assert(!this.deleted, "PathNode must not be deleted");
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
        assert(!this.deleted, "PathNode must not be deleted");
        const key = child.parentField;
        const field = this.children.get(key);
        // TODO: should do more optimized search (ex: binary search or better) using child.parentIndex()
        // Note that this is the index in the list of child paths, not the index within the field
        const childIndex = field?.indexOf(child);
        assert(
            childIndex !== undefined,
            "child must be parented to be removed",
        );
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
        assert(!this.deleted, "PathNode must not be deleted");
        this.children.delete(key);
        if (this.refCount === 0 && this.children.size === 0) {
            this.deleteThis();
        }
    }

    /**
     * Removes this from parent, and sets this to deleated.
     */
    private deleteThis(): void {
        assert(!this.deleted, "must not double delete PathNode");
        this.parentPath?.removeChild(this);

        this.deleted = true;
    }
}
