/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { assert } from "@fluidframework/common-utils";
import {
    IEditableForest,
    lookupGlobalFieldSchema,
    rootFieldKey,
    moveToDetachedField,
    FieldAnchor,
    Anchor,
    Value,
    ITreeCursor,
    IForestSubscription,
    TransactionResult,
    Checkout as TransactionCheckout,
    UpPath,
    FieldKey,
    SimpleObservingDependent,
    InvalidationToken,
    Delta,
    Dependent,
    afterChangeToken,
} from "../../core";
import { DefaultChangeset, DefaultEditBuilder } from "../defaultChangeFamily";
import { runSynchronousTransaction } from "../defaultTransaction";
import { ProxyTarget, EditableField, proxifyField, UnwrappedEditableField } from "./editableTree";

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
    readonly root: EditableField;

    /**
     * Same as `root`, but with unwrapped fields.
     * See ${@link UnwrappedEditableField} for what is unwrapped.
     */
    readonly unwrappedRoot: UnwrappedEditableField;

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
     * Attaches the handler to be called after a transaction, initiated by
     * either this context or any other context or client using this document,
     * is committed successfully.
     */
    attachAfterChangeHandler(afterChangeHandler: (context: EditableTreeContext) => void): void;
}

/**
 * Implementation of `EditableTreeContext`.
 *
 * `transactionCheckout` is required to edit the EditableTrees.
 */
export class ProxyContext implements EditableTreeContext {
    public readonly withCursors: Set<ProxyTarget<Anchor | FieldAnchor>> = new Set();
    public readonly withAnchors: Set<ProxyTarget<Anchor | FieldAnchor>> = new Set();
    private readonly observer: Dependent;
    private readonly afterChangeHandlers: Set<(context: EditableTreeContext) => void> = new Set();

    /**
     * @param forest - the Forest
     * @param transactionCheckout - the Checkout applied to a transaction, not required in read-only usecases.
     */
    constructor(
        public readonly forest: IEditableForest,
        private readonly transactionCheckout?: TransactionCheckout<
            DefaultEditBuilder,
            DefaultChangeset
        >,
    ) {
        this.observer = new SimpleObservingDependent(
            (token?: InvalidationToken, delta?: Delta.Root): void => {
                if (token === afterChangeToken) {
                    this.handleAfterChange();
                } else {
                    this.prepareForEdit();
                }
            },
        );
        this.forest.registerDependent(this.observer);
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
        this.afterChangeHandlers.clear();
    }

    public get unwrappedRoot(): UnwrappedEditableField {
        return this.getRoot(true);
    }

    public get root(): EditableField {
        return this.getRoot(false);
    }

    private getRoot(unwrap: false): EditableField;
    private getRoot(unwrap: true): UnwrappedEditableField;
    private getRoot(unwrap: boolean): UnwrappedEditableField | EditableField {
        const rootSchema = lookupGlobalFieldSchema(this.forest.schema, rootFieldKey);
        const cursor = this.forest.allocateCursor();
        moveToDetachedField(this.forest, cursor);
        const proxifiedField = proxifyField(this, rootSchema, cursor, unwrap);
        cursor.free();
        return proxifiedField;
    }

    public attachAfterChangeHandler(
        afterChangeHandler: (context: EditableTreeContext) => void,
    ): void {
        this.afterChangeHandlers.add(afterChangeHandler);
    }

    private handleAfterChange(): void {
        for (const afterChangeHandler of this.afterChangeHandlers) {
            afterChangeHandler(this);
        }
    }

    public setNodeValue(path: UpPath, value: Value): boolean {
        return this.runTransaction((editor) => editor.setValue(path, value));
    }

    public setOptionalField(
        path: UpPath | undefined,
        fieldKey: FieldKey,
        newContent: ITreeCursor | undefined,
        wasEmpty: boolean,
    ): boolean {
        return this.runTransaction((editor) => {
            const field = editor.optionalField(path, fieldKey);
            field.set(newContent, wasEmpty);
        });
    }

    public insertNodes(
        path: UpPath | undefined,
        fieldKey: FieldKey,
        index: number,
        newContent: ITreeCursor | ITreeCursor[],
    ): boolean {
        return this.runTransaction((editor) => {
            const field = editor.sequenceField(path, fieldKey);
            field.insert(index, newContent);
        });
    }

    public deleteNodes(
        path: UpPath | undefined,
        fieldKey: FieldKey,
        index: number,
        count: number,
    ): boolean {
        return this.runTransaction((editor) => {
            const field = editor.sequenceField(path, fieldKey);
            field.delete(index, count);
        });
    }

    private runTransaction(transaction: (editor: DefaultEditBuilder) => void): boolean {
        assert(
            this.transactionCheckout !== undefined,
            0x45a /* `transactionCheckout` is required to edit the EditableTree */,
        );
        this.prepareForEdit();
        const result = runSynchronousTransaction(
            this.transactionCheckout,
            (forest: IForestSubscription, editor: DefaultEditBuilder) => {
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
 * @param forest - the Forest
 * @param transactionCheckout - the Checkout applied to a transaction, not required in read-only usecases.
 * @returns {@link EditableTreeContext} which is used to manage the cursors and anchors within the EditableTrees:
 * This is necessary for supporting using this tree across edits to the forest, and not leaking memory.
 */
export function getEditableTreeContext(
    forest: IEditableForest,
    transactionCheckout?: TransactionCheckout<DefaultEditBuilder, DefaultChangeset>,
): EditableTreeContext {
    return new ProxyContext(forest, transactionCheckout);
}
