/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { assert } from "@fluidframework/common-utils";
import {
    DisposingDependee, ObservingDependent, recordDependency, SimpleDependee, SimpleObservingDependent,
} from "../../dependency-tracking";
import {
    ITreeCursor, ITreeSubscriptionCursor, NodeId,
    Anchor, IEditableForest,
    ITreeSubscriptionCursorState,
    TreeNavigationResult,
    Value,
    FieldLocation, TreeLocation,
} from "../../forest";
import { StoredSchemaRepository } from "../../schema";
import { FieldKey, TreeType, DetachedRange } from "../../tree";
import { brand } from "../../util";

export class ObjectForest extends SimpleDependee implements IEditableForest {
    private readonly dependent = new SimpleObservingDependent(() => this.invalidateDependents());
    public readonly anchors: Set<ObjectAnchor> = new Set();
    public readonly root: Anchor = new RootAnchor();
    public readonly rootField: DetachedRange = this.newRange();
    public readonly schema: StoredSchemaRepository = new StoredSchemaRepository();

    private readonly roots: Map<DetachedRange, ObjectField> = new Map();

    private readonly dependees: Map<ObjectField | ObjectNode, DisposingDependee> = new Map();

    public observeItem(item: ObjectField | ObjectNode, observer: ObservingDependent | undefined): void {
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

    public getRoot(item: DetachedRange): ObjectField {
        // Currently we assume you only ever need to access a root of you know it exists.
        // Thus we do not track observation of the existence of the root, and error if it does not exists.
        const root = this.roots.get(item);
        assert(root !== undefined, 0x335 /* ObjectForest.getRoot only valid for existing roots */);
        return root;
    }

    public constructor() {
        super("object-forest.ObjectForest");
        this.roots.set(this.rootField, []);
        // Invalidate forest if schema change.
        recordDependency(this.dependent, this.schema);
    }

    private nextRange = 0;
    public newRange(): DetachedRange {
        const range = brand<DetachedRange>(this.nextRange);
        this.nextRange += 1;
        return range;
    }

    add(nodes: Iterable<ITreeCursor>): DetachedRange {
        throw new Error("Method not implemented.");
    }
    attachRangeOfChildren(destination: TreeLocation, toAttach: DetachedRange): void {
        throw new Error("Method not implemented.");
    }
    detachRangeOfChildren(range: FieldLocation | DetachedRange, startIndex: number, endIndex: number): DetachedRange {
        throw new Error("Method not implemented.");
    }
    setValue(nodeId: NodeId, value: any): void {
        throw new Error("Method not implemented.");
    }
    delete(ids: DetachedRange): void {
        throw new Error("Method not implemented.");
    }
    allocateCursor(): ITreeSubscriptionCursor {
        return new Cursor(this);
    }

    tryGet(
        destination: Anchor, cursorToMove: ITreeSubscriptionCursor, observer?: ObservingDependent | undefined,
    ): TreeNavigationResult {
        assert(destination instanceof ObjectAnchor, 0x336 /* ObjectForest must only be given its own Anchors */);
        assert(cursorToMove instanceof Cursor, 0x337 /* ObjectForest must only be given its own Cursor type */);
        assert(cursorToMove.forest === this, 0x338 /* ObjectForest must only be given its own Cursor */);
        const node = destination.find(this, observer);
        if (node === undefined) {
            return TreeNavigationResult.NotFound;
        }
        if (this.getRoot(this.rootField).length === 0) {
            return TreeNavigationResult.NotFound;
        }

        // TODO: it unclear if this should be allowed to modify cursor in the case it does not find the actual result.
        cursorToMove.set(this.rootField, 0);

        // Epically slow solution: search entire tree for node:
        if (this.search(node, cursorToMove) === TreeNavigationResult.NotFound) {
            cursorToMove.clear();
            return TreeNavigationResult.NotFound;
        }
        return TreeNavigationResult.Ok;
    }

    private search(destination: ObjectNode, cursor: Cursor): TreeNavigationResult {
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

/**
 * Simple anchor that just points to a node object.
 * This results in pretty basic anchor rebase policy.
 */
abstract class ObjectAnchor implements Anchor {
    state: ITreeSubscriptionCursorState = ITreeSubscriptionCursorState.Current;
    free(): void {
        assert(this.state === ITreeSubscriptionCursorState.Current, 0x339 /* Anchor must not be double freed */);
        this.state = ITreeSubscriptionCursorState.Freed;
    }

    /**
     * Gets object node for anchor.
     * May return an object node thats no longer in the tree.
     */
    abstract find(forest: ObjectForest, observer: ObservingDependent | undefined): ObjectNode | undefined;
}

class RootAnchor extends ObjectAnchor {
    find(forest: ObjectForest, observer: ObservingDependent | undefined): ObjectNode | undefined {
        const field = forest.getRoot(forest.rootField);
        return field[0];
    }
}

/**
 * Simple anchor that just points to a node object.
 * This results in pretty basic anchor rebase policy.
 */
class NodeAnchor extends ObjectAnchor {
    public constructor(public readonly node: ObjectNode) {
        super();
    }

    find(forest: ObjectForest): ObjectNode | undefined {
        return this.node;
    }
}

class ObjectNode {
    state: ITreeSubscriptionCursorState = ITreeSubscriptionCursorState.Current;
    public readonly children: Map<FieldKey, ObjectField> = new Map();
    public constructor(public type: TreeType, public value: Value = undefined) { }
    free(): void {
        assert(this.state !== ITreeSubscriptionCursorState.Freed, 0x33a /* Anchor must not be double freed */);
        this.state = ITreeSubscriptionCursorState.Freed;
    }
}

type ObjectField = ObjectNode[];

/**
 * TODO: track observations.
 */
class Cursor implements ITreeSubscriptionCursor {
    state: ITreeSubscriptionCursorState = ITreeSubscriptionCursorState.Cleared;
    public constructor(public readonly forest: ObjectForest) { }

    observer?: ObservingDependent | undefined;

    // TODO: store stack here,
    // then brute force on anchor restoration? (Add smarter anchor type later?)
    private root: DetachedRange | undefined;

    // Ancestors traversed to visit this node (including this node).
    private readonly parentStack: ObjectNode[] = [];
    // Keys traversed to visit this node
    private readonly keyStack: FieldKey[] = [];
    // Indices traversed to visit this node
    private readonly indexStack: number[] = [];

    private siblings?: ObjectNode[];

    public clear(): void {
        assert(this.state !== ITreeSubscriptionCursorState.Freed, 0x33b /* Cursor must not be freed */);
        this.root = undefined;
        this.state = ITreeSubscriptionCursorState.Cleared;
        this.parentStack.length = 0;
        this.keyStack.length = 0;
        this.indexStack.length = 0;
        this.siblings = undefined;
    }

    public set(root: DetachedRange, index: number): void {
        assert(this.state !== ITreeSubscriptionCursorState.Freed, 0x33c /* Cursor must not be freed */);
        this.clear();
        this.root = root;
        this.state = ITreeSubscriptionCursorState.Current;
        this.indexStack.push(index);
        this.siblings = this.forest.getRoot(root);
    }

    getNode(): ObjectNode {
        assert(this.state === ITreeSubscriptionCursorState.Current, 0x33d /* Cursor must be current to be used */);
        assert(this.parentStack.length > 0, 0x33e /* Cursor must be current to be used */);
        return this.parentStack[this.parentStack.length - 1];
    }

    get value(): Value {
        // eslint-disable-next-line @typescript-eslint/no-unsafe-return
        return this.getNode().value;
    }

    get type(): TreeType {
        return this.getNode().type;
    }
    get keys(): Iterable<FieldKey> {
        return this.getNode().children.keys();
    }

    fork(observer?: ObservingDependent | undefined): ITreeSubscriptionCursor {
        throw new Error("Method not implemented.");
    }
    free(): void {
        assert(this.state !== ITreeSubscriptionCursorState.Freed, 0x33f /* Cursor must not be double freed */);
        this.state = ITreeSubscriptionCursorState.Freed;
    }
    buildAnchor(): Anchor {
        return new NodeAnchor(this.getNode());
    }
    down(key: FieldKey, index: number): TreeNavigationResult {
        const siblings = (this.getNode().children.get(key) ?? []);
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
        // Maybe truncate move, and move to end?
        return { result: TreeNavigationResult.NotFound, moved: offset };
    }
    up(): TreeNavigationResult {
        assert(this.state === ITreeSubscriptionCursorState.Current, 0x341 /* Cursor must be current to be used */);
        if (this.parentStack.length === 0) {
            return TreeNavigationResult.NotFound;
        }
        this.parentStack.pop();
        this.indexStack.pop();
        this.keyStack.pop();
        // TODO: maybe compute siblings lazily or store in stack? Store instead of keyStack?
        this.siblings = this.parentStack.length === 0 ?
            // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
            this.forest.getRoot(this.root!) :
            this.parentStack[this.parentStack.length - 1].children.get(this.keyStack[this.keyStack.length - 1]);
        return TreeNavigationResult.Ok;
    }

    length(key: FieldKey): number {
        return (this.getNode().children.get(key) ?? []).length;
    }
}
