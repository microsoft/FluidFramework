/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { assert } from "@fluidframework/common-utils";
import {
    DisposingDependee, ObservingDependent, recordDependency, SimpleDependee, SimpleObservingDependent,
} from "../../dependency-tracking";
import {
    ITreeCursor, ITreeSubscriptionCursor, ForestLocation,
    ForestAnchor, IEditableForest,
    ITreeSubscriptionCursorState,
    TreeNavigationResult,
    FieldLocation, TreeLocation, isFieldLocation,
} from "../../forest";
import { StoredSchemaRepository } from "../../schema";
import {
    FieldKey, TreeType, DetachedField, AnchorSet,
    Value, Delta, JsonableTree, getGenericTreeField, FieldMap, UpPath, Anchor,
} from "../../tree";
import { brand, fail } from "../../util";
import { jsonableTreeFromCursor } from "../treeTextCursor";

export class ObjectForest extends SimpleDependee implements IEditableForest {
    private readonly dependent = new SimpleObservingDependent(() => this.invalidateDependents());

    public readonly schema: StoredSchemaRepository = new StoredSchemaRepository();
    public root(range: DetachedField): ForestAnchor { return new RootAnchor(range); }
    public readonly rootField: DetachedField = this.newRange();

    private readonly roots: Map<DetachedField, ObjectField> = new Map();

    private readonly dependees: Map<ObjectField | JsonableTree, DisposingDependee> = new Map();

    // All cursors that are in the "Current" state. Must be empty when editing.
    public readonly currentCursors: Set<Cursor> = new Set();

    public constructor(public readonly anchors: AnchorSet = new AnchorSet()) {
        super("object-forest.ObjectForest");
        this.roots.set(this.rootField, []);
        // Invalidate forest if schema change.
        recordDependency(this.dependent, this.schema);
    }

    applyDelta(delta: Delta.Root): void {
        throw new Error("Method not implemented.");
    }

    public observeItem(item: ObjectField | JsonableTree, observer: ObservingDependent | undefined): void {
        let result = this.dependees.get(item);
        if (result === undefined) {
            result = new DisposingDependee("ObjectForest item");
            this.dependees.set(item, result);
            recordDependency(observer, result);
            result.endInitialization(() => this.dependees.delete(item));
        } else {
            recordDependency(observer, result);
        }
    }

    public getRoot(item: DetachedField): ObjectField {
        // Currently we assume you only ever need to access a root of you know it exists.
        // Thus we do not track observation of the existence of the root, and error if it does not exists.
        const root = this.roots.get(item);
        assert(root !== undefined, 0x335 /* ObjectForest.getRoot only valid for existing roots */);
        return root;
    }

    private nextRange = 0;
    public newRange(): DetachedField {
        const range = brand<DetachedField>(String(this.nextRange));
        this.nextRange += 1;
        return range;
    }

    add(nodes: Iterable<ITreeCursor>): DetachedField {
        this.beforeChange();
        const range = this.newRange();
        assert(!this.roots.has(range), "new range must not already exist");
        const field: ObjectField = Array.from(nodes, jsonableTreeFromCursor);
        this.roots.set(range, field);
        return range;
    }
    attachRangeOfChildren(destination: TreeLocation, toAttach: DetachedField): void {
        this.beforeChange();
        const children = this.roots.get(toAttach) ?? fail("Can not attach non-existent range");
        this.roots.delete(toAttach);
        const destRange = destination.range;
        assert(toAttach !== destRange, "can not attach range to itself");
        if (children.length === 0) {
            return; // Prevent creating 0 sized fields when inserting empty into empty.
        }
        const field: ObjectField = this.lookupField(destRange, true);
        assertValidIndex(destination.index, field, true);
        field.splice(destination.index, 0, ...children);
    }

    private lookupField(range: FieldLocation | DetachedField, create: boolean): ObjectField {
        if (!isFieldLocation(range)) {
            return this.getRoot(range);
        } else {
            const node = this.lookupNodeId(range.parent);
            return getGenericTreeField(node, range.key, create);
        }
    }

    detachRangeOfChildren(range: FieldLocation | DetachedField, startIndex: number, endIndex: number): DetachedField {
        this.beforeChange();
        const field: ObjectField = this.lookupField(range, false);
        assertValidIndex(startIndex, field, true);
        assertValidIndex(endIndex, field, true);
        assert(startIndex <= endIndex, "detached range's end must be after it's start");
        const newRange = this.newRange();
        const newField = field.splice(startIndex, endIndex - startIndex);
        this.roots.set(newRange, newField);
        return newRange;
    }
    setValue(nodeId: ForestLocation, value: Value): void {
        this.beforeChange();
        const node = this.lookupNodeId(nodeId);
        node.value = value;
    }
    delete(range: DetachedField): void {
        this.beforeChange();
        // TODO: maybe define this to leave the forest with an empty root field?
        assert(range !== this.rootField, "root field can not be deleted");
        const deleted = this.roots.delete(range);
        assert(deleted, "deleted range must exist in forest");
    }
    allocateCursor(): Cursor {
        return new Cursor(this);
    }

    private beforeChange(): void {
        assert(this.currentCursors.size === 0, "No cursors can be current when modifying forest");
        this.invalidateDependents();
    }

    tryGet(
        destination: ForestAnchor, cursorToMove: ITreeSubscriptionCursor, observer?: ObservingDependent | undefined,
    ): TreeNavigationResult {
        assert(destination instanceof ObjectAnchor, 0x336 /* ObjectForest must only be given its own Anchors */);
        assert(cursorToMove instanceof Cursor, 0x337 /* ObjectForest must only be given its own Cursor type */);
        assert(cursorToMove.forest === this, 0x338 /* ObjectForest must only be given its own Cursor */);
        const node = destination.find(this, observer);
        if (node === undefined) {
            return TreeNavigationResult.NotFound;
        }
        for (const [range, field] of this.roots) {
            if (field.length !== 0) {
                // TODO: it unclear if this should be allowed to modify cursor in the case
                // it does not find the actual result.
                cursorToMove.set(range, 0);

                // Epically slow solution: search entire tree for node:
                if (this.search(node, cursorToMove) === TreeNavigationResult.NotFound) {
                    cursorToMove.clear();
                } else {
                    return TreeNavigationResult.Ok;
                }
            }
        }

        return TreeNavigationResult.NotFound;
    }

    private lookupNodeId(id: ForestLocation): JsonableTree {
        if (id instanceof Cursor) {
            return id.getNode();
        }

        // TODO: this could be much more efficient (and not use cursor)
        const cursor = this.allocateCursor();
        const result = this.tryGet(id, cursor);
        assert(result === TreeNavigationResult.Ok, "Expected to find anchor");
        const node = cursor.getNode();
        cursor.free();

        return node;
    }

    private search(destination: JsonableTree, cursor: Cursor): TreeNavigationResult {
        if (cursor.getNode() === destination) {
            return TreeNavigationResult.Ok;
        }

        // search children
        for (const key of cursor.keys) {
            cursor.down(key, 0);
            if (this.search(destination, cursor) === TreeNavigationResult.Ok) {
                return TreeNavigationResult.Ok;
            }
            cursor.up();
        }

        // search siblings
        while (cursor.seek(1).result === TreeNavigationResult.Ok) {
            if (this.search(destination, cursor) === TreeNavigationResult.Ok) {
                return TreeNavigationResult.Ok;
            }
        }

        return TreeNavigationResult.NotFound;
    }
}

function assertValidIndex(index: number, array: unknown[], allowOnePastEnd: boolean = false) {
    assert(Number.isInteger(index), "index must be an integer");
    assert(index >= 0, "index must be non-negative");
    if (allowOnePastEnd) {
        assert(index <= array.length, "index must be less than or equal to length");
    } else {
        assert(index < array.length, "index must be less than length");
    }
}

/**
 * Simple anchor that just points to a node object.
 * This results in pretty basic anchor rebase policy.
 */
abstract class ObjectAnchor implements ForestAnchor {
    state: ITreeSubscriptionCursorState = ITreeSubscriptionCursorState.Current;
    free(): void {
        assert(this.state === ITreeSubscriptionCursorState.Current, 0x339 /* Anchor must not be double freed */);
        this.state = ITreeSubscriptionCursorState.Freed;
    }

    /**
     * Gets object node for anchor.
     * May return an object node thats no longer in the tree.
     */
    abstract find(forest: ObjectForest, observer: ObservingDependent | undefined): JsonableTree | undefined;
}

class RootAnchor extends ObjectAnchor {
    constructor(public readonly range: DetachedField) {
        super();
    }
    find(forest: ObjectForest, observer: ObservingDependent | undefined): JsonableTree | undefined {
        const field = forest.getRoot(this.range);
        return field[0];
    }
}

/**
 * AnchorSet powered ForestAnchor.
 */
 export class ObjectPathAnchor extends ObjectAnchor implements ForestAnchor {
    state: ITreeSubscriptionCursorState = ITreeSubscriptionCursorState.Current;
    public constructor(public readonly path: Anchor, private readonly anchorSet: AnchorSet) {
        super();
    }
    free(): void {
        super.free();
        this.anchorSet.forget(this.path);
    }

    find(forest: ObjectForest, observer: ObservingDependent | undefined): JsonableTree | undefined {
        const path = forest.anchors.locate(this.path);
        if (path === undefined) {
            return undefined;
        }
        // TODO: follow path down tree and return subtree;
        throw new Error("Method not implemented.");
    }
}

type ObjectField = JsonableTree[];

/**
 * TODO: track observations.
 *
 * TODO: TextCursor is mostly a subset of this functionality.
 * Maybe do a refactoring to deduplicate this.
 */
class Cursor implements ITreeSubscriptionCursor {
    state: ITreeSubscriptionCursorState = ITreeSubscriptionCursorState.Cleared;
    public constructor(public readonly forest: ObjectForest) { }

    observer?: ObservingDependent | undefined;

    // TODO: store stack here,
    // then brute force on anchor restoration? (Add smarter anchor type later?)
    private root: DetachedField | undefined;

    // Ancestors traversed to visit this node (including this node).
    private readonly parentStack: JsonableTree[] = [];
    // Keys traversed to visit this node
    private readonly keyStack: FieldKey[] = [];
    // Indices traversed to visit this node
    private readonly indexStack: number[] = [];

    private siblings?: readonly JsonableTree[];

    public clear(): void {
        assert(this.state !== ITreeSubscriptionCursorState.Freed, 0x33b /* Cursor must not be freed */);
        this.root = undefined;
        this.state = ITreeSubscriptionCursorState.Cleared;
        this.parentStack.length = 0;
        this.keyStack.length = 0;
        this.indexStack.length = 0;
        this.siblings = undefined;
        this.forest.currentCursors.delete(this);
    }

    public set(root: DetachedField, index: number): void {
        assert(this.state !== ITreeSubscriptionCursorState.Freed, 0x33c /* Cursor must not be freed */);
        this.clear();
        this.root = root;
        this.state = ITreeSubscriptionCursorState.Current;
        this.indexStack.push(index);
        this.siblings = this.forest.getRoot(root);
        this.parentStack.push(this.siblings[index]);
        this.forest.currentCursors.add(this);
    }

    getNode(): JsonableTree {
        assert(this.state === ITreeSubscriptionCursorState.Current, 0x33d /* Cursor must be current to be used */);
        assert(this.parentStack.length > 0, 0x33e /* Cursor must be current to be used */);
        return this.parentStack[this.parentStack.length - 1];
    }

    getFields(): Readonly<FieldMap<JsonableTree>> {
        return this.getNode().fields ?? {};
    }

    getField(key: FieldKey): readonly JsonableTree[] {
        return this.getFields()[key as string] ?? [];
    }

    get value(): Value {
        return this.getNode().value;
    }

    get type(): TreeType {
        return this.getNode().type;
    }
    get keys(): Iterable<FieldKey> {
        return Object.getOwnPropertyNames(this.getFields()) as Iterable<FieldKey>;
    }

    fork(observer?: ObservingDependent | undefined): ITreeSubscriptionCursor {
        throw new Error("Method not implemented."); // TODO
    }
    free(): void {
        assert(this.state !== ITreeSubscriptionCursorState.Freed, 0x33f /* Cursor must not be double freed */);
        this.state = ITreeSubscriptionCursorState.Freed;
    }
    buildAnchor(): ForestAnchor {
        // Perf Note:
        // This is O(depth) in tree.
        // If many different anchors are created, this could be optimized to amortize the costs.
        // For example, the cursor could cache UpPaths from the anchorSet when creating an anchor,
        // then reuse them as a starting point when making another.
        // Could cache this at one depth, and remember the depth.
        // When navigating up, adjust cached anchor if present.

        let path: UpPath | undefined;
        const length = this.parentStack.length;
        assert(this.indexStack.length === length, "Unexpected indexStack.length");
        assert(this.keyStack.length === length - 1, "Unexpected keyStack.length");
        for (let height = 0; height < length; height++) {
            path = {
                parent: path,
                parentIndex: this.indexStack[height],
                parentField: height === 0 ? this.root as unknown as FieldKey : this.keyStack[height + 1],
            };
        }
        // Height must be at least one (since its greater than this.keyStack.length), so path will always be set here.
        // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
        const anchor = this.forest.anchors.track(path!);
        return new ObjectPathAnchor(anchor, this.forest.anchors);
    }
    down(key: FieldKey, index: number): TreeNavigationResult {
        const siblings = this.getField(key);
        const child = siblings[index];
        if (child !== undefined) {
            this.parentStack.push(child);
            this.indexStack.push(index);
            this.keyStack.push(key);
            this.siblings = siblings;
            return TreeNavigationResult.Ok;
        }
        return TreeNavigationResult.NotFound;
    }
    seek(offset: number): { result: TreeNavigationResult; moved: number; } {
        assert(this.state === ITreeSubscriptionCursorState.Current, 0x340 /* Cursor must be current to be used */);
        const index = offset + this.indexStack[this.indexStack.length - 1];
        // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
        const child = this.siblings![index];
        if (child !== undefined) {
            this.indexStack[this.indexStack.length - 1] = index;
            this.parentStack[this.parentStack.length - 1] = child;
            return { result: TreeNavigationResult.Ok, moved: offset };
        }
        // TODO: Maybe truncate move, and move to end?
        return { result: TreeNavigationResult.NotFound, moved: 0 };
    }
    up(): TreeNavigationResult {
        if (this.parentStack.pop() === undefined) {
            // We are at the root, so return NotFound without making any changes to the state.
            return TreeNavigationResult.NotFound;
        }
        this.indexStack.pop();
        this.keyStack.pop();
        // TODO: maybe compute siblings lazily or store in stack? Store instead of keyStack?
        if (this.parentStack.length === 0) {
            // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
            this.siblings = this.forest.getRoot(this.root!);
        } else {
            const newParent = this.parentStack[this.parentStack.length - 1];
            this.siblings = getGenericTreeField(newParent, this.keyStack[this.keyStack.length - 1], false);
        }
        return TreeNavigationResult.Ok;
    }

    length(key: FieldKey): number {
        return this.getField(key).length;
    }
}

// This function is the only package level export for objectForest, and hides all the implementation types.
// When other forest implementations are created (ex: optimized ones),
// this function should likely be moved and updated to (at least conditionally) use them.
/**
 * @returns an implementation of {@link IEditableForest} with no data or schema.
 */
export function buildForest(): IEditableForest {
    return new ObjectForest();
}
