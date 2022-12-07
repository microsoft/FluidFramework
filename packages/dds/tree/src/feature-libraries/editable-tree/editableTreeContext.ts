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
    TreeSchemaIdentifier,
    SchemaDataAndPolicy,
} from "../../core";
import { Brand, BrandedType } from "../../util";
import { DefaultChangeset, DefaultEditBuilder } from "../defaultChangeFamily";
import { runSynchronousTransaction } from "../defaultTransaction";
import { Multiplicity } from "../modular-schema";
import {
    ProxyTarget,
    EditableField,
    proxifyField,
    UnwrappedEditableField,
    EditableTree,
} from "./editableTree";
import { tryGetCursorFor, DetachedNode, getFieldKind } from "./utilities";

/**
 * A common context of a "forest" of EditableTrees.
 * It handles group operations like transforming cursors into anchors for edits.
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
    root: EditableField;

    /**
     * Same as `root`, but with unwrapped fields.
     * See ${@link UnwrappedEditableField} for what is unwrapped.
     */
    unwrappedRoot: UnwrappedEditableField;

    /**
     * Schema used within this context.
     * All data must conform to these schema.
     *
     * The root's schema is tracked under {@link rootFieldKey}.
     */
    readonly schema: SchemaDataAndPolicy;

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
     * It is invalid to use the context after this.
     */
    free(): void;

    /**
     * Release any cursors and anchors held by EditableTrees created in this context.
     * The EditableTrees are invalid to use after this, but the context may still be used
     * to create new trees starting from the root.
     */
    clear(): void;

    /**
     * Attaches the handler to be called after a transaction, initiated by
     * either this context or any other context or client using this document,
     * is committed successfully.
     */
    attachAfterChangeHandler(afterChangeHandler: (context: EditableTreeContext) => void): void;

    /**
     * Types an arbitrary data with the given `TreeSchemaIdentifier` and wraps it into a format,
     * which can be accepted by the EditableTree when using simple assignments.
     *
     * Use it whenever the field is polymorphic, to explicitly define the type of your data.
     */
    newDetachedNode<T extends Brand<any, string>>(
        type: TreeSchemaIdentifier,
        data: T extends BrandedType<infer ValueType, infer Name>
            ? BrandedType<ValueType, Name>
            : never,
    ): T;
    /**
     * Types an arbitrary data with the given `TreeSchemaIdentifier` and wraps it into a format,
     * which can be accepted by the EditableTree when using simple assignments.
     *
     * Use it whenever the field is polymorphic, to explicitly define the type of your data.
     */
    newDetachedNode<T extends Brand<any, string>>(
        type: TreeSchemaIdentifier,
        data: T extends BrandedType<infer ValueType, string> ? ValueType : never,
    ): T;
    /**
     * _Type-unsafe overload of the method allowing to change EditableTrees using simple assignments in contexts,
     * where proper typing is not possible or not important._
     *
     * Types an arbitrary data with the given `TreeSchemaIdentifier` and wraps it into a format,
     * which can be accepted by the EditableTree when using simple assignments.
     *
     * Use it whenever the field is polymorphic, to explicitly define the type of your data.
     */
    newDetachedNode<T extends Brand<any, string>>(type: TreeSchemaIdentifier, data: unknown): T;
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
        this.clear();
        this.forest.removeDependent(this.observer);
    }

    public clear(): void {
        for (const target of this.withCursors) {
            target.free();
        }
        for (const target of this.withAnchors) {
            target.free();
        }
        assert(this.withCursors.size === 0, 0x3c1 /* free should remove all cursors */);
        assert(this.withAnchors.size === 0, 0x3c2 /* free should remove all anchors */);
    }

    public get unwrappedRoot(): UnwrappedEditableField {
        return this.getRoot(true);
    }

    public set unwrappedRoot(value: UnwrappedEditableField) {
        const rootField = this.getRoot(false);
        const cursors: ITreeCursor[] = [];
        if (getFieldKind(rootField.fieldSchema).multiplicity === Multiplicity.Sequence) {
            assert(Array.isArray(value), "The sequence root expects array data.");
            for (const node of value) {
                cursors.push(tryGetCursorFor(this.schema, rootField.fieldSchema, node));
            }
        } else {
            cursors.push(tryGetCursorFor(this.schema, rootField.fieldSchema, value));
        }
        if (rootField.length > 0) {
            rootField.replaceNodes(0, cursors);
        } else {
            rootField.insertNodes(0, cursors);
        }
    }

    public get root(): EditableField {
        return this.getRoot(false);
    }

    public set root(value: EditableField) {
        const rootField = this.getRoot(false);
        assert(Array.isArray(value), "expected array data");
        const cursors: ITreeCursor[] = [];
        for (const node of value) {
            cursors.push(tryGetCursorFor(this.schema, rootField.fieldSchema, node));
        }
        if (rootField.length > 0) {
            rootField.replaceNodes(0, cursors);
        } else {
            rootField.insertNodes(0, cursors);
        }
    }

    private getRoot(unwrap: false): EditableField;
    private getRoot(unwrap: true): UnwrappedEditableField;
    private getRoot(unwrap: boolean): UnwrappedEditableField | EditableField {
        const rootSchema = lookupGlobalFieldSchema(this.schema, rootFieldKey);
        const cursor = this.forest.allocateCursor();
        moveToDetachedField(this.forest, cursor);
        const proxifiedField = proxifyField(this, rootSchema, cursor, unwrap);
        cursor.free();
        return proxifiedField;
    }

    public get schema(): SchemaDataAndPolicy {
        return this.forest.schema;
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

    public setValueField(
        path: UpPath | undefined,
        fieldKey: FieldKey,
        newContent: ITreeCursor,
    ): boolean {
        return this.runTransaction((editor) => {
            const field = editor.valueField(path, fieldKey);
            field.set(newContent);
        });
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

    public replaceNodes(
        path: UpPath | undefined,
        fieldKey: FieldKey,
        index: number,
        count: number,
        newContent: ITreeCursor | ITreeCursor[],
    ): boolean {
        return this.runTransaction((editor) => {
            const field = editor.sequenceField(path, fieldKey);
            field.delete(index, count);
            field.insert(index, newContent);
        });
    }

    private runTransaction(transaction: (editor: DefaultEditBuilder) => void): boolean {
        assert(
            this.transactionCheckout !== undefined,
            0x45a /* `transactionCheckout` is required to edit the EditableTree */,
        );
        const result = runSynchronousTransaction(
            this.transactionCheckout,
            (forest: IForestSubscription, editor: DefaultEditBuilder) => {
                transaction(editor);
                return TransactionResult.Apply;
            },
        );
        return result === TransactionResult.Apply;
    }

    public newDetachedNode<T extends Brand<any, string> | undefined>(
        type: TreeSchemaIdentifier,
        data: unknown,
    ): T & EditableTree {
        return new DetachedNode(this.schema, type, data) as unknown as T & EditableTree;
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
