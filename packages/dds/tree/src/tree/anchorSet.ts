/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { assert } from "@fluidframework/common-utils";
import { brand, Brand } from "../util";
import {
    FieldKey,
    EmptyKey,
 } from "../tree";
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
        const anchor = brand<Anchor>(this.anchorCounter++);
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
     * Updates paths for a range move (including re-parenting path items and updating indexes).
     */
    public moveChildren(
        src: UpPath, srcField: FieldKey, start: number, count: number,
        dst: UpPath, dstField: FieldKey, dstIndex: number): void {
            const srcPath = this.find(src);
            // Sorted list of PathNodes to move from src to dst.
            let toMove: PathNode[];
            if (srcPath !== undefined) {
                // TODO: set toMove
                // Remove items from src.
                // Fix indexes in src after moved items (subtract count).
                toMove = [];
            } else {
                toMove = [];
            }
            let dstPath: PathNode | undefined;
            if (toMove.length > 0) {
                // There are anchors which are getting moved,
                // therefor the destination needs to be created if it does not yet exist.
                dstPath = this.trackInner(dst);
            } else {
                // There are no anchors to move,
                // therefor we want to avoid creating the destination if it does not already exist.
                dstPath = this.find(dst);
                if (dstPath !== undefined) {
                    // Since we need a remove ref below to handle the `toMove.length > 0` case above,
                    // add a ref here so that does not break this case.
                    dstPath.addRef();
                }
            }

            if (dstPath !== undefined) {
                // TODO: Fixup indexes for items in toMove (add dstIndex - start)
                // TODO: Fixup indexes for items in dstPath after insertion (add count)
                // TODO: insert toMove items into dstPath
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

    // PathNode arrays are kept sorted the PathNode's parentIndex for efficient search.
    protected readonly children: Map<FieldKey, PathNode[]> = new Map();
    /**
     * Construct a PathNode with refcount 1.
     * @param anchorSet - used to determine if this PathNode is already part of a specific anchorSet
     * to early out UpPath walking.
     */
    public constructor(
        public readonly anchorSet: AnchorSet,
        public parentField: FieldKey,
        public parentIndex: number,
        public parentPath: PathNode | undefined) {}

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
        assert(this.parentPath !== undefined,
            "PathNode.parent is an UpPath API and thus should never be called on the root PathNode.");
        // Root PathNode corresponds to the undefined root for UpPath API.
        if (this.parentPath.isRoot()) {
            return undefined;
        }
        return this.parentPath;
    }

    public addRef(count = 1): void {
        this.refCount += count;
    }

    public removeRef(count = 1): void {
        this.refCount -= count;
        if (this.refCount < 1) {
            assert(this.refCount === 0, "PathNode Refcount should not be negative.");

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
            field.sort((a, b) => a.parentIndex = b.parentIndex);
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
        const field = this.children.get(key);
        if (field === undefined) {
            return undefined;
        }
        // TODO: should do more optimized search (ex: binary search or better) using index.
        return field.find((c) => c.parentIndex === index);
    }

    public removeChild(child: PathNode): void {
        const key = child.parentField;
        const field = this.children.get(key);
        // TODO: should do more optimized search (ex: binary search or better) using child.parentIndex()
        // Note that this is the index in the list of child paths, not the index within the field
        const childIndex = field?.indexOf(child);
        assert(childIndex !== undefined, "child must be parented to be removed");
        field?.splice(childIndex, 1);
        if (field?.length === 0) {
            this.children.delete(key);
            if (this.refCount === 0 && this.children.size === 0) {
                this.deleteThis();
            }
        }
    }

    private deleteThis(): void {
        // TODO: set some deleted state so operations on detached/deleted PathNodes/UpPaths
        // error instead of behaving unexpectedly.
        this.parentPath?.removeChild(this);
    }
}
