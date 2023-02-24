/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { assert } from "@fluidframework/common-utils";
import {
    recordDependency,
    SimpleDependee,
    SimpleObservingDependent,
    ITreeSubscriptionCursor,
    IEditableForest,
    ITreeSubscriptionCursorState,
    TreeNavigationResult,
    StoredSchemaRepository,
    FieldKey,
    DetachedField,
    AnchorSet,
    detachedFieldAsKey,
    Value,
    Delta,
    UpPath,
    Anchor,
    visitDelta,
    ITreeCursor,
    CursorLocationType,
    TreeSchemaIdentifier,
    TreeValue,
    MapTree,
    getMapTreeField,
    FieldAnchor,
    FieldUpPath,
    ForestEvents,
    PathRootPrefix,
} from "../../core";
import { brand, fail } from "../../util";
import { CursorWithNode, SynchronousCursor } from "../treeCursorUtils";
import { mapTreeFromCursor, singleMapTreeCursor } from "../mapTreeCursor";
import { createEmitter } from "../../events";

function makeRoot(): MapTree {
    return {
        type: brand("above root placeholder"),
        fields: new Map(),
    };
}

/**
 * Reference implementation of IEditableForest.
 *
 * This implementation focuses on correctness and simplicity, not performance.
 * It does not use compressed chunks: instead nodes are implemented using objects.
 */
class ObjectForest extends SimpleDependee implements IEditableForest {
    private readonly dependent = new SimpleObservingDependent(() => this.invalidateDependents());

    public readonly roots: MapTree = makeRoot();

    // All cursors that are in the "Current" state. Must be empty when editing.
    public readonly currentCursors: Set<Cursor> = new Set();

    private readonly events = createEmitter<ForestEvents>();

    public constructor(
        public readonly schema: StoredSchemaRepository,
        public readonly anchors: AnchorSet = new AnchorSet(),
    ) {
        super("object-forest.ObjectForest");
        // Invalidate forest if schema change.
        recordDependency(this.dependent, this.schema);
    }

    public on<K extends keyof ForestEvents>(eventName: K, listener: ForestEvents[K]): () => void {
        return this.events.on(eventName, listener);
    }

    clone(schema: StoredSchemaRepository, anchors: AnchorSet): ObjectForest {
        const forest = new ObjectForest(schema, anchors);
        // Deep copy the trees.
        for (const [key, value] of this.roots.fields) {
            // TODO: this references the existing TreeValues instead of copying them:
            // they are assumed to be copy on write. See TODO on NodeData.
            forest.roots.fields.set(
                key,
                value.map((v) => mapTreeFromCursor(singleMapTreeCursor(v))),
            );
        }
        return forest;
    }

    public forgetAnchor(anchor: Anchor): void {
        this.anchors.forget(anchor);
    }

    applyDelta(delta: Delta.Root): void {
        this.events.emit("beforeDelta", delta);
        this.invalidateDependents();
        assert(
            this.currentCursors.size === 0,
            0x374 /* No cursors can be current when modifying forest */,
        );

        // Note: This code uses cursors, however it also modifies the tree.
        // In general this is not safe, but this code happens to only modify the tree below the current cursor location,
        // which happens to work.
        // This pattern could be generalized/formalized with a concept of an exclusive cursor,
        // which can edit, but is the only cursor allowed at the time.

        const moves: Map<Delta.MoveId, DetachedField> = new Map();
        const cursor: Cursor = this.allocateCursor();
        cursor.setToAboveDetachedSequences();
        const moveIn = (index: number, toAttach: DetachedField): number => {
            const detachedKey = detachedFieldAsKey(toAttach);
            const children = getMapTreeField(this.roots, detachedKey, false);
            this.roots.fields.delete(detachedKey);
            if (children.length === 0) {
                return 0; // Prevent creating 0 sized fields when inserting empty into empty.
            }

            const [parent, key] = cursor.getParent();
            const destinationField = getMapTreeField(parent, key, true);
            assertValidIndex(index, destinationField, true);
            // TODO: this will fail for very large moves due to argument limits.
            destinationField.splice(index, 0, ...children);

            return children.length;
        };
        const visitor = {
            onDelete: (index: number, count: number): void => {
                visitor.onMoveOut(index, count);
            },
            onInsert: (index: number, content: Delta.ProtoNode[]): void => {
                const range = this.add(content);
                moveIn(index, range);
            },
            onMoveOut: (index: number, count: number, id?: Delta.MoveId): void => {
                const [parent, key] = cursor.getParent();
                const sourceField = getMapTreeField(parent, key, false);
                const field = this.detachRangeOfChildren(sourceField, index, index + count);
                if (id !== undefined) {
                    moves.set(id, field);
                } else {
                    this.delete(field);
                }
            },
            onMoveIn: (index: number, count: number, id: Delta.MoveId): void => {
                const toAttach = moves.get(id) ?? fail("move in without move out");
                moves.delete(id);
                const countMoved = moveIn(index, toAttach);
                assert(countMoved === count, 0x369 /* counts must match */);
            },
            onSetValue: (value: Value): void => {
                const node = cursor.getNode();
                if (value !== undefined) {
                    node.value = value;
                } else {
                    delete node.value;
                }
            },
            enterNode: (index: number): void => cursor.enterNode(index),
            exitNode: (index: number): void => cursor.exitNode(),
            enterField: (key: FieldKey): void => cursor.enterField(key),
            exitField: (key: FieldKey): void => cursor.exitField(),
        };
        visitDelta(delta, visitor);
        cursor.free();

        this.events.emit("afterDelta", delta);
    }

    private nextRange = 0;
    public newDetachedField(): DetachedField {
        const range: DetachedField = brand(String(this.nextRange));
        this.nextRange += 1;
        return range;
    }

    private add(nodes: Iterable<ITreeCursor>): DetachedField {
        const field: ObjectField = Array.from(nodes, mapTreeFromCursor);
        return this.addFieldAsDetached(field);
    }

    private addFieldAsDetached(field: ObjectField): DetachedField {
        const detached = this.newDetachedField();
        const key = detachedFieldAsKey(detached);
        assert(!this.roots.fields.has(key), 0x370 /* new range must not already exist */);
        if (field.length > 0) {
            this.roots.fields.set(key, field);
        }
        return detached;
    }

    private detachRangeOfChildren(
        field: ObjectField,
        startIndex: number,
        endIndex: number,
    ): DetachedField {
        assertValidIndex(startIndex, field, true);
        assertValidIndex(endIndex, field, true);
        assert(startIndex <= endIndex, 0x371 /* detached range's end must be after its start */);
        const newField = field.splice(startIndex, endIndex - startIndex);
        return this.addFieldAsDetached(newField);
    }

    private delete(field: DetachedField): void {
        this.roots.fields.delete(detachedFieldAsKey(field));
    }

    allocateCursor(): Cursor {
        return new Cursor(this);
    }

    tryMoveCursorToNode(
        destination: Anchor,
        cursorToMove: ITreeSubscriptionCursor,
    ): TreeNavigationResult {
        const path = this.anchors.locate(destination);
        if (path === undefined) {
            return TreeNavigationResult.NotFound;
        }
        this.moveCursorToPath(path, cursorToMove);
        return TreeNavigationResult.Ok;
    }

    tryMoveCursorToField(
        destination: FieldAnchor,
        cursorToMove: ITreeSubscriptionCursor,
    ): TreeNavigationResult {
        if (destination.parent === undefined) {
            this.moveCursorToPath(undefined, cursorToMove);
        } else {
            const result = this.tryMoveCursorToNode(destination.parent, cursorToMove);
            if (result !== TreeNavigationResult.Ok) {
                return result;
            }
        }
        cursorToMove.enterField(destination.fieldKey);
        return TreeNavigationResult.Ok;
    }

    /**
     * Set `cursorToMove` to location described by path.
     * This is NOT a relative move: current position is discarded.
     * Path must point to existing node.
     */
    moveCursorToPath(destination: UpPath | undefined, cursorToMove: ITreeSubscriptionCursor): void {
        assert(
            cursorToMove instanceof Cursor,
            0x337 /* ObjectForest must only be given its own Cursor type */,
        );
        assert(
            cursorToMove.forest === this,
            0x338 /* ObjectForest must only be given its own Cursor */,
        );

        const indexStack: number[] = [];
        const keyStack: FieldKey[] = [];

        let path: UpPath | undefined = destination;
        while (path !== undefined) {
            indexStack.push(path.parentIndex);
            keyStack.push(path.parentField);
            path = path.parent;
        }
        cursorToMove.setToAboveDetachedSequences();
        while (keyStack.length > 0) {
            // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
            cursorToMove.enterField(keyStack.pop()!);
            // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
            cursorToMove.enterNode(indexStack.pop()!);
        }

        return;
    }
}

function assertValidIndex(index: number, array: unknown[], allowOnePastEnd: boolean = false) {
    assert(Number.isInteger(index), 0x376 /* index must be an integer */);
    assert(index >= 0, 0x377 /* index must be non-negative */);
    if (allowOnePastEnd) {
        assert(index <= array.length, 0x378 /* index must be less than or equal to length */);
    } else {
        assert(index < array.length, 0x379 /* index must be less than length */);
    }
}

type ObjectField = MapTree[];

/**
 * Cursor implementation for ObjectForest.
 */
class Cursor extends SynchronousCursor implements ITreeSubscriptionCursor {
    state: ITreeSubscriptionCursorState;

    /**
     * @param forest - forest this cursor navigates
     * @param innerCursor - underlying cursor implementation this wraps. `undefined` when state is not `Current`
     */
    public constructor(
        public readonly forest: ObjectForest,
        private innerCursor?: CursorWithNode<MapTree>,
    ) {
        super();
        if (innerCursor === undefined) {
            this.state = ITreeSubscriptionCursorState.Cleared;
        } else {
            this.state = ITreeSubscriptionCursorState.Current;
            this.forest.currentCursors.add(this);
        }
    }

    buildFieldAnchor(): FieldAnchor {
        const path = this.getFieldPath();
        const anchor =
            path.parent === undefined ? undefined : this.forest.anchors.track(path.parent);
        return { parent: anchor, fieldKey: path.field };
    }
    getFieldPath(prefix?: PathRootPrefix): FieldUpPath {
        assert(this.innerCursor !== undefined, 0x45f /* Cursor must be current to be used */);
        return this.innerCursor.getFieldPath(prefix);
    }
    get mode(): CursorLocationType {
        assert(this.innerCursor !== undefined, 0x42e /* Cursor must be current to be used */);
        return this.innerCursor.mode;
    }

    nextField(): boolean {
        assert(this.innerCursor !== undefined, 0x42f /* Cursor must be current to be used */);
        return this.innerCursor.nextField();
    }
    exitField(): void {
        assert(this.innerCursor !== undefined, 0x430 /* Cursor must be current to be used */);
        return this.innerCursor.exitField();
    }
    skipPendingFields(): boolean {
        assert(this.innerCursor !== undefined, 0x431 /* Cursor must be current to be used */);
        return this.innerCursor.skipPendingFields();
    }
    getFieldKey(): FieldKey {
        assert(this.innerCursor !== undefined, 0x432 /* Cursor must be current to be used */);
        return this.innerCursor.getFieldKey();
    }
    getFieldLength(): number {
        assert(this.innerCursor !== undefined, 0x433 /* Cursor must be current to be used */);
        return this.innerCursor.getFieldLength();
    }
    firstNode(): boolean {
        assert(this.innerCursor !== undefined, 0x434 /* Cursor must be current to be used */);
        return this.innerCursor.firstNode();
    }
    enterNode(childIndex: number): void {
        assert(this.innerCursor !== undefined, 0x435 /* Cursor must be current to be used */);
        return this.innerCursor.enterNode(childIndex);
    }
    getPath(prefix?: PathRootPrefix): UpPath {
        assert(this.innerCursor !== undefined, 0x436 /* Cursor must be current to be used */);
        return this.innerCursor.getPath(prefix) ?? fail("no path when at root");
    }
    get fieldIndex(): number {
        assert(this.innerCursor !== undefined, 0x437 /* Cursor must be current to be used */);
        return this.innerCursor.fieldIndex;
    }
    get chunkStart(): number {
        assert(this.innerCursor !== undefined, 0x438 /* Cursor must be current to be used */);
        return this.innerCursor.chunkStart;
    }
    get chunkLength(): number {
        assert(this.innerCursor !== undefined, 0x439 /* Cursor must be current to be used */);
        return this.innerCursor.chunkLength;
    }
    seekNodes(offset: number): boolean {
        assert(this.innerCursor !== undefined, 0x43a /* Cursor must be current to be used */);
        return this.innerCursor.seekNodes(offset);
    }
    nextNode(): boolean {
        assert(this.innerCursor !== undefined, 0x43b /* Cursor must be current to be used */);
        return this.innerCursor.nextNode();
    }
    exitNode(): void {
        assert(this.innerCursor !== undefined, 0x43c /* Cursor must be current to be used */);
        return this.innerCursor.exitNode();
    }
    firstField(): boolean {
        assert(this.innerCursor !== undefined, 0x43d /* Cursor must be current to be used */);
        return this.innerCursor.firstField();
    }
    enterField(key: FieldKey): void {
        assert(this.innerCursor !== undefined, 0x43e /* Cursor must be current to be used */);
        return this.innerCursor.enterField(key);
    }
    get type(): TreeSchemaIdentifier {
        assert(this.innerCursor !== undefined, 0x43f /* Cursor must be current to be used */);
        return this.innerCursor.type;
    }
    get value(): TreeValue {
        assert(this.innerCursor !== undefined, 0x440 /* Cursor must be current to be used */);
        return this.innerCursor.value;
    }

    // TODO: tests for clear when not at root.
    public clear(): void {
        assert(
            this.state !== ITreeSubscriptionCursorState.Freed,
            0x33b /* Cursor must not be freed */,
        );
        this.state = ITreeSubscriptionCursorState.Cleared;
        this.innerCursor = undefined;
        this.forest.currentCursors.delete(this);
    }

    /**
     * Move this cursor to the special dummy node above the detached sequences.
     * Can be used when cleared (but not freed).
     */
    public setToAboveDetachedSequences(): void {
        assert(
            this.state !== ITreeSubscriptionCursorState.Freed,
            0x33c /* Cursor must not be freed */,
        );
        this.clear();
        this.state = ITreeSubscriptionCursorState.Current;
        this.innerCursor = singleMapTreeCursor(this.forest.roots);
        this.forest.currentCursors.add(this);
    }

    getNode(): MapTree {
        assert(this.innerCursor !== undefined, 0x33e /* Cursor must be current to be used */);
        return this.innerCursor.getNode();
    }

    getParent(): [MapTree, FieldKey] {
        assert(this.innerCursor !== undefined, 0x441 /* Cursor must be current to be used */);
        // This could be optimized to skip moving it accessing internals of cursor.
        const key = this.innerCursor.getFieldKey();
        this.innerCursor.exitField();
        const node = this.innerCursor.getNode();
        this.innerCursor.enterField(key);
        return [node, key];
    }

    fork(): ITreeSubscriptionCursor {
        assert(this.innerCursor !== undefined, 0x460 /* Cursor must be current to be used */);
        return new Cursor(this.forest, this.innerCursor.fork());
    }

    free(): void {
        assert(
            this.state !== ITreeSubscriptionCursorState.Freed,
            0x33f /* Cursor must not be double freed */,
        );
        this.forest.currentCursors.delete(this);
        this.state = ITreeSubscriptionCursorState.Freed;
    }

    buildAnchor(): Anchor {
        assert(
            this.state === ITreeSubscriptionCursorState.Current,
            0x37a /* Cursor must be current to be used */,
        );
        return this.forest.anchors.track(this.getPath());
    }
}

// This function is the only package level export for objectForest, and hides all the implementation types.
// When other forest implementations are created (ex: optimized ones),
// this function should likely be moved and updated to (at least conditionally) use them.
/**
 * @returns an implementation of {@link IEditableForest} with no data or schema.
 */
export function buildForest(schema: StoredSchemaRepository, anchors?: AnchorSet): IEditableForest {
    return new ObjectForest(schema, anchors);
}
