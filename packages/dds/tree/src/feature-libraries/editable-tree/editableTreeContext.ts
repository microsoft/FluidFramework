/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

/* eslint-disable @typescript-eslint/no-non-null-assertion */
import { assert } from "@fluidframework/common-utils";
import { TransactionResult } from "../../checkout";
import { Dependent, SimpleObservingDependent, InvalidationToken } from "../../dependency-tracking";
import { IEditableForest, ITreeSubscriptionCursor, ITreeCursor, IForestSubscription, TreeNavigationResult } from "../../forest";
import { lookupGlobalFieldSchema } from "../../schema-stored";
import { Checkout as TransactionCheckout, runSynchronousTransaction } from "../../transaction";
import { Delta, detachedFieldAsKey, rootFieldKey, UpPath, Value } from "../../tree";
import { Multiplicity } from "../modular-schema";
import { NodePath, SequenceChangeset, SequenceEditBuilder } from "../sequence-change-family";
import { RootedTextCursor } from "../treeTextCursorLegacy";
import { isEmptyTree, proxifyField, ProxyTarget, UnwrappedEditableField } from "./editableTree";
import { ProxyTargetSequence } from "./editableTreeSequence";
import { EditiableTreePath, getFieldKind, pathToString } from "./utilities";

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
     * Register `afterHandler` to be called whenever a change is applied to the EditiableTree.
     * A change is a result of a successful transaction initiated by either this context or
     * any other context or client using this document.
     */
    registerAfterHandler(afterHandler: EditableTreeContextHandler): void;

    /**
     * Call to upload initial data to the document.
     * This method may be called only when the document is empty (see {@link isEmptyTree}).
     * @param rootCursor - a cursor providing access to the root data.
     */
    createRoot(rootCursor: ITreeCursor): UnwrappedEditableField;
}

export type EditableTreeContextHandler = (this: EditableTreeContext) => void;

/**
 * An implementation of a common context of a "forest" of EditableTrees.
 */
// TODO: document
export class ProxyContext implements EditableTreeContext {
    public readonly withCursors: Set<ProxyTarget> = new Set();
    public readonly withAnchors: Set<ProxyTarget> = new Set();
    /**
     * Observers which are part of this context.
     * Collected here so they can be removed when this is freed.
     */
    private readonly observers: Dependent[] = [];
    private readonly afterHandlers: Set<EditableTreeContextHandler> = new Set();
    private readonly nodes: Map<EditiableTreePath, ProxyTarget> = new Map();
    private emptyNode?: ProxyTarget;

    constructor(
        public readonly forest: IEditableForest,
        private readonly transactionCheckout?: TransactionCheckout<
            SequenceEditBuilder,
            SequenceChangeset
        >,
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

    public createRoot(rootCursor: ITreeCursor): UnwrappedEditableField {
        assert(isEmptyTree(this.root), "The document already contains data.");
        this.insertNode({
            parent: undefined,
            parentField: detachedFieldAsKey(this.forest.rootField),
            parentIndex: 0,
        }, rootCursor);
        return this.root;
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
        const rootSchema = lookupGlobalFieldSchema(this.forest.schema, rootFieldKey);
        const fieldKind = getFieldKind(rootSchema);
        if (fieldKind.multiplicity === Multiplicity.Sequence) {
            return proxifyField(this, new ProxyTargetSequence(this));
        }
        const cursor = this.forest.allocateCursor();
        const destination = this.forest.root(this.forest.rootField);
        const cursorResult = this.forest.tryMoveCursorTo(destination, cursor);
        if (cursorResult === TreeNavigationResult.Ok) {
            assert(cursor.seek(1) === TreeNavigationResult.NotFound, "invalid non sequence")
            this.emptyNode?.free();
            this.emptyNode = undefined;
        }
        const target = cursorResult === TreeNavigationResult.Ok ? this.createTarget(cursor) : this.createEmptyTarget();
        cursor.free();
        this.forest.anchors.forget(destination);
        return proxifyField(this, target);
    }

    public createEmptyTarget(): ProxyTarget {
        if (!this.emptyNode) {
            this.emptyNode = new ProxyTarget(this);
        }
        return this.emptyNode;
    }

    public createTarget(cursor: ITreeSubscriptionCursor): ProxyTarget {
        // TODO: remove this assumption about the underlying cursor type once migrated to the new cursor API
        const path = (cursor as unknown as RootedTextCursor).getPath();
        const nodePath = pathToString(path);
        if (!this.nodes.has(nodePath)) {
            this.nodes.set(nodePath, new ProxyTarget(this, cursor));
        }
        return this.nodes.get(nodePath)!;
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
        return this.runTransaction((editor) => {
            let nextPath = path;
            do {
                editor.insert(nextPath, newNodeCursor);
                nextPath = { ...path, parentIndex: path.parentIndex + 1 };
            } while (newNodeCursor.seek(1) === TreeNavigationResult.Ok)
        });
    }

    public deleteNode(path: NodePath, count: number): boolean {
        return this.runTransaction((editor) => editor.delete(path, count));
    }

    private runTransaction(transaction: (editor: SequenceEditBuilder) => void): boolean {
        // TODO: currently we can't rely on `invalidateDependents`, since it happens only in forest's `beforeChange`,
        // and before that delta is applied in `AnchorSet`, so all nodes should already have their anchors allocated.
        this.prepareForEdit();
        const result = runSynchronousTransaction(this.transactionCheckout!,
            (forest: IForestSubscription, editor: SequenceEditBuilder) => {
                transaction(editor);
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
 * @param transactionCheckout - a Checkout applied to a transaction, not required in read-only usecases.
 * @returns {@link EditableTreeContext} which is used manage the cursors and anchors within the EditableTrees:
 * This is necessary for supporting using this tree across edits to the forest, and not leaking memory.
 */
export function getEditableTreeContext(
    forest: IEditableForest,
    transactionCheckout?: TransactionCheckout<
        SequenceEditBuilder,
        SequenceChangeset
    >,
): EditableTreeContext {
    return new ProxyContext(forest, transactionCheckout);
}
