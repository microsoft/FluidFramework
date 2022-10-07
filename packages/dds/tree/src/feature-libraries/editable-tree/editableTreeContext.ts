/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { assert } from "@fluidframework/common-utils";
import { TransactionResult } from "../../checkout";
import { Dependent, SimpleObservingDependent, InvalidationToken } from "../../dependency-tracking";
import {
    IEditableForest,
    IForestSubscription,
    ITreeCursor,
    TreeNavigationResult,
} from "../../forest";
import { lookupGlobalFieldSchema } from "../../schema-stored";
import { Checkout as TransactionCheckout, runSynchronousTransaction } from "../../transaction";
import { Delta, detachedFieldAsKey, rootFieldKey } from "../../tree";
import { Multiplicity } from "../modular-schema";
import { NodePath, SequenceChangeset, SequenceEditBuilder } from "../sequence-change-family";
import {
    EditableTree,
    emptyTreeSymbol,
    proxifyField,
    ProxyTarget,
    UnwrappedEditableField,
} from "./editableTree";
import { getFieldKind } from "./utilities";

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
     *
     * Not (yet) supported: create properties, set values and delete properties.
     */
    get root(): UnwrappedEditableField;

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
     * Inserts a root node (or nodes) depending on its multiplicity.
     * This method may be called only when the document is empty (see {@link emptyTreeSymbol}).
     * @param rootCursor - a cursor providing access to the rooted data.
     */
    createRoot(rootCursor: ITreeCursor): UnwrappedEditableField;

    /**
     * If true, fields typed as {@link isPrimitive} will be unwrapped to just their values.
     * If this is changed, get new root to see the changes.
     */
    unwrapPrimitives: boolean;
}

export class ProxyContext implements EditableTreeContext {
    public readonly withCursors: Set<ProxyTarget> = new Set();
    public readonly withAnchors: Set<ProxyTarget> = new Set();
    public unwrapPrimitives: boolean = false;
    private readonly observer: Dependent;

    constructor(
        public readonly forest: IEditableForest,
        private readonly transactionCheckout?: TransactionCheckout<
            SequenceEditBuilder,
            SequenceChangeset
        >,
    ) {
        this.observer = new SimpleObservingDependent((token?: InvalidationToken, delta?: Delta.Root): void => {
            this.prepareForEdit();
        });
        forest.registerDependent(this.observer);
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
        assert(this.withCursors.size === 0, 0x3c1 /* free should remove all cursors */);
        assert(this.withAnchors.size === 0, 0x3c2 /* free should remove all anchors */);
        this.forest.removeDependent(this.observer);
    }

    public get root(): UnwrappedEditableField {
        const rootSchema = lookupGlobalFieldSchema(this.forest.schema, rootFieldKey);
        const fieldKind = getFieldKind(rootSchema);
        const cursor = this.forest.allocateCursor();
        const destination = this.forest.root(this.forest.rootField);
        const cursorResult = this.forest.tryMoveCursorTo(destination, cursor);
        const targets: ProxyTarget[] = [];
        if (cursorResult === TreeNavigationResult.Ok) {
            do {
                targets.push(new ProxyTarget(this, cursor));
            } while (cursor.seek(1) === TreeNavigationResult.Ok);
        } else {
            if (fieldKind.multiplicity !== Multiplicity.Sequence) {
                // empty target
                targets.push(new ProxyTarget(this));
            }
        }
        cursor.free();
        this.forest.anchors.forget(destination);
        return proxifyField(getFieldKind(rootSchema), targets);
    }

    public createRoot(rootCursor: ITreeCursor): UnwrappedEditableField {
        if (Array.isArray(this.root)) {
            assert(this.root.length === 0, "The document is not empty.");
        } else {
            assert((this.root as EditableTree)[emptyTreeSymbol], "The document is not empty.");
        }
        const isCreated = this.insertNode(
            {
                parent: undefined,
                parentField: detachedFieldAsKey(this.forest.rootField),
                parentIndex: 0,
            },
            rootCursor,
        );
        return isCreated ? this.root : undefined;
    }

    private insertNode(path: NodePath, newNodeCursor: ITreeCursor): boolean {
        return this.runTransaction((editor) => {
            let currentPath = path;
            do {
                editor.insert(currentPath, newNodeCursor);
                currentPath = { ...path, parentIndex: path.parentIndex + 1 };
            } while (newNodeCursor.seek(1) === TreeNavigationResult.Ok);
        });
    }

    private runTransaction(transaction: (editor: SequenceEditBuilder) => void): boolean {
        assert(
            this.transactionCheckout !== undefined,
            "'transactionCheckout' is required to run a transaction.",
        );
        this.prepareForEdit();
        const result = runSynchronousTransaction(
            this.transactionCheckout,
            (forest: IForestSubscription, editor: SequenceEditBuilder) => {
                transaction(editor);
                return TransactionResult.Apply;
            },
        );
        return result === TransactionResult.Apply;
    }
}

/**
 * A simple API for a Forest to interact with the tree.
 *
 * @param forest - a Forest to interact with.
 * @param transactionCheckout - a Checkout applied to a transaction, not required in read-only usecases.
 * @returns {@link EditableTreeContext} which is used to manage the cursors and anchors within the EditableTrees:
 * This is necessary for supporting using this tree across edits to the forest, and not leaking memory.
 */
export function getEditableTreeContext(
    forest: IEditableForest,
    transactionCheckout?: TransactionCheckout<SequenceEditBuilder, SequenceChangeset>,
    unwrapPrimitives = false,
): EditableTreeContext {
    return new ProxyContext(forest, transactionCheckout);
}
