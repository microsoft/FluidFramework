/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { assert } from "@fluidframework/common-utils";
import { TextCursor, jsonableTreeFromCursor } from "../treeTextCursor";
import {
    DisposingDependee, ObservingDependent, recordDependency, SimpleDependee, SimpleObservingDependent,
} from "../../dependency-tracking";
import {
    ITreeCursor, ITreeSubscriptionCursor, IEditableForest,
    ITreeSubscriptionCursorState,
    TreeNavigationResult,
} from "../../forest";
import { StoredSchemaRepository } from "../../schema";
import {
    FieldKey, TreeType, DetachedField, AnchorSet, detachedFieldAsKey, keyAsDetachedField,
    Value, Delta, JsonableTree, getGenericTreeField, FieldMap, UpPath, Anchor, visitDelta,
} from "../../tree";
import { brand, fail } from "../../util";

export class ObjectForest extends SimpleDependee implements IEditableForest {
    private readonly dependent = new SimpleObservingDependent(() => this.invalidateDependents());

    public readonly schema: StoredSchemaRepository = new StoredSchemaRepository();

    public readonly rootField: DetachedField;

    private readonly roots: Map<DetachedField, ObjectField> = new Map();

    private readonly dependees: Map<ObjectField | JsonableTree, DisposingDependee> = new Map();

    // All cursors that are in the "Current" state. Must be empty when editing.
    public readonly currentCursors: Set<Cursor> = new Set();

    public constructor(public readonly anchors: AnchorSet = new AnchorSet()) {
        super("object-forest.ObjectForest");
        this.rootField = this.newDetachedField();
        this.roots.set(this.rootField, []);
        // Invalidate forest if schema change.
        recordDependency(this.dependent, this.schema);
    }

    public root(range: DetachedField): Anchor {
        return this.anchors.track(
            { parent: undefined, parentField: detachedFieldAsKey(range), parentIndex: 0 },
        );
    }

    applyDelta(delta: Delta.Root): void {
        // TODO: refactor object forest to use root node above detached fields, like how PathNode works.
        // Then factor out this editing code to work on any such JsonableTree.

        this.beforeChange();
        const moves: Map<Delta.MoveId, DetachedField> = new Map();
        const currentNode: Cursor = this.allocateCursor();
        let currentField: FieldKey | undefined;
        const moveIn = (index: number, toAttach: DetachedField): number => {
            assert(currentField !== undefined, "must be in field to onMoveIn");
            const children = this.roots.get(toAttach) ?? fail("Can not attach non-existent range");
            this.roots.delete(toAttach);
            let dstField: ObjectField;
            if (currentNode.state === ITreeSubscriptionCursorState.Cleared) {
                const dst = currentField as unknown as DetachedField;
                assert(toAttach !== dst, "can not attach range to itself");
                // TODO: protect against parenting under itself creating a cycle as well:
                // or maybe that should delete the subtree?
                dstField = this.getRoot(dst);
            } else {
                if (children.length === 0) {
                    return 0; // Prevent creating 0 sized fields when inserting empty into empty.
                }
                dstField = getGenericTreeField(currentNode, currentField, true);
            }
            assertValidIndex(index, dstField, true);
            // TODO: this will fail for very large moves due to argument limits.
            dstField.splice(index, 0, ...children);

            return children.length;
        };
        const visitor = {
            onDelete: (index: number, count: number): void => {
                assert(currentField !== undefined, "must be in field to onDelete");
                visitor.onMoveOut(index, count);
            },
            onInsert: (index: number, content: Delta.ProtoNode[]): void => {
                assert(currentField !== undefined, "must be in field to onInsert");
                const range = this.add(content.map((data) => new TextCursor(data)));
                moveIn(index, range);
            },
            onMoveOut: (index: number, count: number, id?: Delta.MoveId): void => {
                assert(currentField !== undefined, "must be in field to onMoveOut");
                let srcField: ObjectField;
                if (currentNode.state === ITreeSubscriptionCursorState.Cleared) {
                    srcField = this.getRoot(currentField as unknown as DetachedField);
                } else {
                    srcField = getGenericTreeField(currentNode, currentField, false);
                }
                const field = this.detachRangeOfChildren(srcField, index, index + count);
                if (id !== undefined) {
                    moves.set(id, field);
                } else {
                    this.delete(field);
                }
            },
            onMoveIn: (index: number, count: number, id: Delta.MoveId): void => {
                assert(currentField !== undefined, "must be in field to onMoveIn");
                const toAttach = moves.get(id) ?? fail("move in without move out");
                moves.delete(id);
                const countMoved = moveIn(index, toAttach);
                assert(countMoved === count, "counts must match");
            },
            onSetValue: (value: Value): void => {
                assert(currentField === undefined, "must be in node to onSetValue");
                const node = currentNode.getNode();
                if (value !== undefined) {
                    node.value = value;
                } else {
                    delete node.value;
                }
            },
            enterNode: (index: number): void => {
                assert(currentField !== undefined, "must be in field to enterNode");
                let result: TreeNavigationResult;
                if (currentNode.state === ITreeSubscriptionCursorState.Cleared) {
                    result = this.tryMoveCursorTo(this.root(currentField as unknown as DetachedField), currentNode);
                } else {
                    result = currentNode.down(currentField, index);
                }
                assert(result === TreeNavigationResult.Ok, "can only enter existing nodes");
                currentField = undefined;
            },
            exitNode: (index: number): void => {
                assert(currentField === undefined, "must be in node to exitNode");
                currentField = currentNode.getParentFieldKey();
                const result = currentNode.up();
                if (result === TreeNavigationResult.NotFound) {
                    currentNode.clear();
                }
            },
            enterField: (key: FieldKey): void => {
                assert(currentField === undefined, "must be in node to enterField");
                currentField = key;
            },
            exitField: (key: FieldKey): void => {
                assert(currentField !== undefined, "must be in field to exitField");
                currentField = undefined;
            },
        };
        visitDelta(delta, visitor);
        currentNode.free();
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
    public newDetachedField(): DetachedField {
        const range: DetachedField = brand(String(this.nextRange));
        this.nextRange += 1;
        return range;
    }

    private add(nodes: Iterable<ITreeCursor>): DetachedField {
        const range = this.newDetachedField();
        assert(!this.roots.has(range), "new range must not already exist");
        const field: ObjectField = Array.from(nodes, jsonableTreeFromCursor);
        this.roots.set(range, field);
        return range;
    }

    private detachRangeOfChildren(field: ObjectField, startIndex: number, endIndex: number): DetachedField {
        assertValidIndex(startIndex, field, true);
        assertValidIndex(endIndex, field, true);
        assert(startIndex <= endIndex, "detached range's end must be after it's start");
        const newRange = this.newDetachedField();
        const newField = field.splice(startIndex, endIndex - startIndex);
        this.roots.set(newRange, newField);
        return newRange;
    }

    private delete(range: DetachedField): void {
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

    tryMoveCursorTo(
        destination: Anchor, cursorToMove: ITreeSubscriptionCursor, observer?: ObservingDependent,
    ): TreeNavigationResult {
        const path = this.anchors.locate(destination);
        if (path === undefined) {
            return TreeNavigationResult.NotFound;
        }
        this.moveCursorToPath(path, cursorToMove, observer);
        return TreeNavigationResult.Ok;
    }

    /**
     * Set `cursorToMove` to location described by path.
     * This is NOT a relative move: current position is discarded.
     * Path must point to existing node.
     */
    moveCursorToPath(destination: UpPath, cursorToMove: ITreeSubscriptionCursor, observer?: ObservingDependent): void {
        assert(cursorToMove instanceof Cursor, 0x337 /* ObjectForest must only be given its own Cursor type */);
        assert(cursorToMove.forest === this, 0x338 /* ObjectForest must only be given its own Cursor */);

        const indexStack: number[] = [];
        const keyStack: FieldKey[] = [];

        let path: UpPath | undefined = destination;
        while (path !== undefined) {
            indexStack.push(path.parentIndex);
            keyStack.push(path.parentField);
            path = path.parent;
        }
        // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
        cursorToMove.set(keyAsDetachedField(keyStack.pop()!), indexStack.pop()!);
        while (keyStack.length > 0) {
            // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
            const result = cursorToMove.down(keyStack.pop()!, indexStack.pop()!);
            assert(result === TreeNavigationResult.Ok, "path should point to existing node");
        }

        return;
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

    // Indices traversed to visit this node: does not include current level (which is stored in `index`).
    private readonly indexStack: number[] = [];
    // Siblings into which indexStack indexes: does not include current level (which is stored in `siblings`).
    private readonly siblingStack: JsonableTree[][] = [];
    // Keys traversed to visit this node, including detached field at the beginning.
    private readonly keyStack: FieldKey[] = [];

    private siblings?: JsonableTree[];
    private index: number = -1;

    // TODO: tests for clear when not at root.
    public clear(): void {
        assert(this.state !== ITreeSubscriptionCursorState.Freed, 0x33b /* Cursor must not be freed */);
        this.state = ITreeSubscriptionCursorState.Cleared;
        this.keyStack.length = 0;
        this.siblingStack.length = 0;
        this.indexStack.length = 0;
        this.siblings = undefined;
        this.index = -1;
        this.forest.currentCursors.delete(this);
    }

    public set(root: DetachedField, index: number): void {
        assert(this.state !== ITreeSubscriptionCursorState.Freed, 0x33c /* Cursor must not be freed */);
        this.clear();
        this.state = ITreeSubscriptionCursorState.Current;
        this.index = index;
        this.siblings = this.forest.getRoot(root);
        this.forest.currentCursors.add(this);
        this.keyStack.push(detachedFieldAsKey(root));
    }

    getNode(): JsonableTree {
        assert(this.siblings !== undefined, 0x33e /* Cursor must be current to be used */);
        return this.siblings[this.index];
    }

    getParentFieldKey(): FieldKey {
        return this.keyStack[this.keyStack.length - 1];
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

    fork(observer?: ObservingDependent): ITreeSubscriptionCursor {
        const other = this.forest.allocateCursor();
        const path = this.getPath();
        this.forest.moveCursorToPath(path, other, observer);
        return other;
    }

    free(): void {
        assert(this.state !== ITreeSubscriptionCursorState.Freed, 0x33f /* Cursor must not be double freed */);
        this.state = ITreeSubscriptionCursorState.Freed;
    }

    getPath(): UpPath {
        // Perf Note:
        // This is O(depth) in tree.
        // If many different anchors are created, this could be optimized to amortize the costs.
        // For example, the cursor could cache UpPaths from the anchorSet when creating an anchor,
        // then reuse them as a starting point when making another.
        // Could cache this at one depth, and remember the depth.
        // When navigating up, adjust cached anchor if present.

        let path: UpPath | undefined;
        const length = this.indexStack.length;
        assert(this.siblingStack.length === length, "Unexpected siblingStack.length");
        assert(this.keyStack.length === length + 1, "Unexpected keyStack.length");
        for (let height = 0; height < length; height++) {
            path = {
                parent: path,
                parentIndex: this.indexStack[height],
                parentField: this.keyStack[height],
            };
        }
        path = {
            parent: path,
            parentIndex: this.index,
            parentField: this.keyStack[length],
        };
        return path;
    }

    buildAnchor(): Anchor {
        return this.forest.anchors.track(this.getPath());
    }

    down(key: FieldKey, index: number): TreeNavigationResult {
        const siblings = getGenericTreeField(this.getNode(), key, false);
        const child = siblings[index];
        if (child !== undefined) {
            this.indexStack.push(this.index);
            // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
            this.siblingStack.push(this.siblings!);
            this.keyStack.push(key);
            this.siblings = siblings;
            this.index = index;
            return TreeNavigationResult.Ok;
        }
        return TreeNavigationResult.NotFound;
    }

    seek(offset: number): TreeNavigationResult {
        assert(this.siblings !== undefined, 0x340 /* Cursor must be current to be used */);
        const index = offset + this.index;
        const child = this.siblings[index];
        if (child !== undefined) {
            this.index = index;
            return TreeNavigationResult.Ok;
        }
        return TreeNavigationResult.NotFound;
    }

    up(): TreeNavigationResult {
        const index = this.indexStack.pop();
        if (index === undefined) {
            // At root already (and made no changes to current location)
            return TreeNavigationResult.NotFound;
        }

        this.index = index;
        this.siblings = this.siblingStack.pop() ?? fail("Unexpected siblingStack.length");
        this.keyStack.pop();
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
