 /*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { assert } from "@fluidframework/common-utils";
import { DisposingDependee, ObservingDependent, recordDependency, SimpleDependee } from "../dependency-tracking";
import {
    ITreeCursor, ITreeSubscriptionCursor, NodeId,
    Anchor, IEditableForest,
    ITreeSubscriptionCursorState,
    TreeNavigationResult,
    DetachedRange,
    Value,
} from "../forest";
import { FieldKey, TreeType } from "../tree";
import { brand } from "../util";

export class ObjectForest extends SimpleDependee implements IEditableForest {
    public readonly anchors: Set<ObjectAnchor> = new Set();
    public readonly root: Anchor = new RootAnchor();
    public readonly rootField: DetachedRange = this.newRange();

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
        assert(root !== undefined, "ObjectForest.getRoot only valid for existing roots");
        return root;
    }

    public constructor() {
        super("object-forest.ObjectForest");
        this.roots.set(this.rootField, []);
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
    attachRangeOfChildren(parentId: NodeId, label: FieldKey, index: number, childIds: DetachedRange): void {
        throw new Error("Method not implemented.");
    }
    detachRangeOfChildren(parentId: NodeId, label: FieldKey, startIndex: number, endIndex: number): DetachedRange {
        throw new Error("Method not implemented.");
    }
    setValue(nodeId: NodeId, value: any): void {
        throw new Error("Method not implemented.");
    }
    delete(ids: DetachedRange): void {
        throw new Error("Method not implemented.");
    }
    allocateCursor(): ITreeSubscriptionCursor {
        throw new Error("Method not implemented.");
    }

    tryGet(
        destination: Anchor, cursorToMove: ITreeSubscriptionCursor, observer?: ObservingDependent | undefined,
        ): TreeNavigationResult {
        assert(destination instanceof ObjectAnchor, "ObjectForest must only be given its own Anchors");
        const node = destination.find(this, observer);
        throw new Error("Method not implemented.");
    }
}

/**
 * Simple anchor that just points to a node object.
 * This results in pretty basic anchor rebase policy.
 */
 abstract class ObjectAnchor implements Anchor {
    state: ITreeSubscriptionCursorState = ITreeSubscriptionCursorState.Current;
    free(): void {
        assert(this.state === ITreeSubscriptionCursorState.Current, "Anchor must not be double freed");
        this.state = ITreeSubscriptionCursorState.Freed;
    }

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
    public constructor() {}
    free(): void {
        assert(this.state === ITreeSubscriptionCursorState.Current, "Anchor must not be double freed");
        this.state = ITreeSubscriptionCursorState.Freed;
    }

    value: Value;
}

type ObjectField = ObjectNode[];

class Cursor implements ITreeSubscriptionCursor {
    state: ITreeSubscriptionCursorState = ITreeSubscriptionCursorState.Cleared;
    private readonly node?: ObjectNode;
    public constructor(public readonly forest: ObjectForest) {}

    observer?: ObservingDependent | undefined;

    getNode(): ObjectNode {
        assert(this.state === ITreeSubscriptionCursorState.Current, "Cursor must be current to be used");
        assert(this.node !== undefined, "Cursor must be current to be used");
        return this.node;
    }

    get value(): Value {
        return this.getNode().value();
    }

    get type(): TreeType {
        throw new Error("Method not implemented.");
    }
    get keys(): Iterable<FieldKey> {
        throw new Error("Method not implemented.");
    }

    fork(observer?: ObservingDependent | undefined): ITreeSubscriptionCursor {
        throw new Error("Method not implemented.");
    }
    free(): void {
        throw new Error("Method not implemented.");
    }
    buildAnchor(): Anchor {
        throw new Error("Method not implemented.");
    }
    down(key: FieldKey, index: number): TreeNavigationResult {
        throw new Error("Method not implemented.");
    }
    seek(offset: number): { result: TreeNavigationResult; moved: number; } {
        throw new Error("Method not implemented.");
    }
    up(): TreeNavigationResult {
        throw new Error("Method not implemented.");
    }

    length(key: FieldKey): number {
        throw new Error("Method not implemented.");
    }
}
