/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

/* eslint-disable @typescript-eslint/no-non-null-assertion */
import { assert } from "@fluidframework/common-utils";
import { TransactionResult } from "../../checkout";
import { Dependent, SimpleObservingDependent, InvalidationToken } from "../../dependency-tracking";
import { IEditableForest, ITreeSubscriptionCursor, ITreeCursor, IForestSubscription, TreeNavigationResult } from "../../forest";
import { ISharedTree } from "../../shared-tree";
import { Delta, rootFieldKey, UpPath, Value } from "../../tree";
import { Brand } from "../../util";
import { Multiplicity } from "../modular-schema";
import { NodePath, SequenceEditBuilder } from "../sequence-change-family";
import { RootedTextCursor } from "../treeTextCursorLegacy";
import { proxifyField, ProxyTarget, UnwrappedEditableField } from "./editableTree";
import { ProxyTargetSequence } from "./editableTreeSequence";
import { getFieldKind, pathToString } from "./utilities";

/**
 * A common context of a "forest" of EditableTrees.
 * It handles group operations like transforming cursors into anchors for edits.
 * TODO: add test coverage.
 */
export interface EditableTreeContext {
    /**
     * Gets a Javascript Proxy providing a JavaScript object like API for interacting with the tree.
     *
     * Use built-in JS functions to get more information about the data stored e.g.
     * ```
     * for (const key of Object.keys(context.root)) { ... }
     * // OR
     * if ("foo" in data) { ... }
     * context.free();
     * ```
     */
    readonly root: UnwrappedEditableField;

    /**
     * Call before editing.
     *
     * Note that after performing edits, EditableTrees for nodes that no longer exist are invalid to use.
     * TODO: maybe add an API to check if a specific EditableTree still exists,
     * and only make use other than that invalid.
     */
    prepareForEdit(): void;

    /**
     * Call to free resources.
     * EditableTrees created in this context are invalid to use after this.
     */
    free(): void;

    /**
     * Register a handler function to be called after changes applied to the forest.
     */
    registerAfterHandler(afterHandler: EditableTreeContextHandler): void;
}

export type EditableTreeContextHandler = (this: EditableTreeContext) => void;

export type ETreeNodePath = Brand<string, "editable-tree.NodePath">;

/**
 * An implementation of a common context of a "forest" of EditableTrees.
 */
export class ProxyContext implements EditableTreeContext {
    public readonly withCursors: Set<ProxyTarget | ProxyTargetSequence> = new Set();
    public readonly withAnchors: Set<ProxyTarget | ProxyTargetSequence> = new Set();
    private readonly observers: Dependent[] = [];
    private readonly afterHandlers: Set<EditableTreeContextHandler> = new Set();
    private readonly nodes: Map<ETreeNodePath, ProxyTarget | ProxyTargetSequence> = new Map();
    private emptyNode?: ProxyTarget;

    constructor(
        public readonly forest: IEditableForest,
        public readonly tree?: ISharedTree,
    ) {
        const observer = new SimpleObservingDependent((token?: InvalidationToken, delta?: Delta.Root): void => {
            if (token?.isSecondaryInvalidation) {
                // TODO: this is only an example of after change processing, which is not supported yet by ObjectForest/SharedTree.
                this.handleAfterChange();
            } else {
                this.prepareForEdit();
            }
        });
        this.observers.push(observer);
        forest.registerDependent(observer);
    }

    public prepareForEdit(): void {
        for (const target of this.withCursors) {
            target.prepareForEdit();
        }
        assert(this.withCursors.size === 0, 0x3c0 /* prepareForEdit should remove all cursors */);
    }

    public free(): void {
        for (const target of this.withCursors) {
            target.free();
        }
        for (const target of this.withAnchors) {
            target.free();
        }
        for (const observer of this.observers) {
            this.forest.removeDependent(observer);
        }
        assert(this.withCursors.size === 0, 0x3c1 /* free should remove all cursors */);
        assert(this.withAnchors.size === 0, 0x3c2 /* free should remove all anchors */);
    }

    public get root(): UnwrappedEditableField {
        const cursor = this.forest.allocateCursor();
        const destination = this.forest.root(this.forest.rootField);
        const cursorResult = this.forest.tryMoveCursorTo(destination, cursor);
        const targets: ProxyTarget[] = [];
        if (cursorResult === TreeNavigationResult.Ok) {
            this.emptyNode?.free();
            this.emptyNode = undefined;
            do {
                targets.push(this.createTarget(cursor));
            } while (cursor.seek(1) === TreeNavigationResult.Ok);
        }
        cursor.free();
        this.forest.anchors.forget(destination);
        const rootSchema = this.forest.schema.lookupGlobalFieldSchema(rootFieldKey);
        const fieldKind = getFieldKind(rootSchema);
        if (targets.length === 0 && fieldKind.multiplicity !== Multiplicity.Sequence) {
            targets.push(this.createEmptyTarget());
        }
        return proxifyField(this, getFieldKind(rootSchema), targets);
    }

    public createEmptyTarget(): ProxyTarget {
        if (!this.emptyNode) {
            this.emptyNode = new ProxyTarget(this);
        }
        return this.emptyNode;
    }

    public createTarget(cursor: ITreeSubscriptionCursor): ProxyTarget {
        const path = (cursor as unknown as RootedTextCursor).getPath();
        const nodePath = pathToString(path);
        if (!this.nodes.has(nodePath)) {
            this.nodes.set(nodePath, new ProxyTarget(this, cursor));
        }
        return this.nodes.get(nodePath)! as ProxyTarget;
    }

    private handleAfterChange(): void {
        for (const [key, target] of this.nodes) {
            const path = target.getPath();
            if (!this.isValidPath(path)) {
                this.nodes.delete(key);
                target.free();
            }
        }
        for (const afterHandler of this.afterHandlers) {
            afterHandler.call(this);
        }
    }

    public registerAfterHandler(afterHandler: EditableTreeContextHandler): void {
        this.afterHandlers.add(afterHandler);
    }

    public setNodeValue(path: NodePath, value: Value): boolean {
        return this.runTransaction((editor) => editor.setValue(path, value));
    }

    public insertNode(path: NodePath, newNodeCursor: ITreeCursor): boolean {
        return this.runTransaction((editor) => editor.insert(path, newNodeCursor));
    }

    public deleteNode(path: NodePath, count: number): boolean {
        return this.runTransaction((editor) => editor.delete(path, count));
    }

    private runTransaction(f: (editor: SequenceEditBuilder) => void): boolean {
        assert(this.tree !== undefined, "Transaction-based editing requires `SharedTree` instance");
        // TODO: currently we can't rely on `invalidateDependents`, since it happens only in forest's `beforeChange`,
        // and before that delta is applied in `AnchorSet`, so all nodes should already have their anchors allocated.
        this.prepareForEdit();
        const result = this.tree.runTransaction((forest: IForestSubscription, editor: SequenceEditBuilder) => {
            f(editor);
            return TransactionResult.Apply;
        });
        if (result === TransactionResult.Apply) {
            // TODO: remove as soon as "after change" notification will be implemented in SharedTree
            this.handleAfterChange();
            return true;
        }
        return false;
    }

    // this is a workaround to cleanup nodes under deleted parents
    private isValidPath(path: UpPath | undefined): boolean {
        let _path = path;
        try {
            while (_path?.parent !== undefined) {
                _path = _path?.parent;
            }
        } catch {
            return false;
        }
        return _path !== undefined;
    }
}

/**
 * A simple API for a Forest to interact with the tree.
 *
 * @param forest - a Forest to interact with.
 * @param tree - a SharedTree to handle transactional editing, not required in read-only usecases.
 * @returns {@link EditableTreeContext} which is used manage the cursors and anchors within the EditableTrees:
 * This is necessary for supporting using this tree across edits to the forest, and not leaking memory.
 */
export function getEditableTreeContext(forest: IEditableForest, tree?: ISharedTree): EditableTreeContext {
    return new ProxyContext(forest, tree);
}
