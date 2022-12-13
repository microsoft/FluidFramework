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
    SchemaDataAndPolicy,
} from "../../core";
import { DefaultChangeset, DefaultEditBuilder } from "../defaultChangeFamily";
import { runSynchronousTransaction } from "../defaultTransaction";
import { singleMapTreeCursor } from "../mapTreeCursor";
import { ProxyTarget, EditableField, proxifyField, UnwrappedEditableField } from "./editableTree";
import { applyFieldTypesFromContext, ContextuallyTypedNodeData } from "./utilities";

/**
 * A common context of a "forest" of EditableTrees.
 * It handles group operations like transforming cursors into anchors for edits.
 */
export interface EditableTreeContext {
    /**
     * Gets or sets the root field of the tree.
     *
     * Its setter works exactly the same way as {@link EditableTreeContext.unwrappedRoot}.
     */
    get root(): EditableField;

    set root(data: ContextuallyTypedNodeData | undefined);

    /**
     * Gets or sets the root field of the tree.
     *
     * When using its getter, see {@link UnwrappedEditableField} for what is unwrapped.
     *
     * When using its setter, the input data has to follow the root field schema.
     *
     * If the input data is `undefined`, the field nodes will be deleted
     * if its not empty and its schema follows the `Optional` multiplicity.
     * For any other multiplicities except of `Forbidden` (in which case the field is alway empty),
     * an exception will be thrown.
     * Use empty array (`[]`) instead to delete all nodes of a sequence root.
     *
     * If the input data is a {@link ContextuallyTypedNodeData}, it must be formed depending
     * on a multiplicity of the field, on if its polymorphic or, for non-sequence multiplicities,
     * on if the field's node declares its primary function using a primary field (see `getPrimaryField`):
     * - for `Sequence` multiplicities and "primary fielded" nodes, array data or an {@link EditableField} is expected;
     * - for `Value` or `Optional` multiplicities, `ContextuallyTypedNodeDataObject` is expected.
     *
     * If the field is a non-sequence and some of its types declare to follow
     * the `String`, `Number` or `Boolean` value schema (see `ValueSchema`),
     * a `PrimitiveValue` can be used to create/replace the field or to set the value of the primitive node.
     * Required is to be possible to unambiguously resolve the node type out of a primitive type
     * of the data and the field types, or, if there are none, of the types of the global tree schema.
     */
    // TODO: replace "replace" semantics for primitives with "change value" whenever possible
    get unwrappedRoot(): UnwrappedEditableField;

    set unwrappedRoot(data: ContextuallyTypedNodeData | undefined);

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

    public set unwrappedRoot(value: ContextuallyTypedNodeData | undefined) {
        const rootField = this.getRoot(false);
        const mapTrees = applyFieldTypesFromContext(this.schema, rootField.fieldSchema, value);
        const cursors = mapTrees.map(singleMapTreeCursor);
        if (rootField.length > 0) {
            rootField.replaceNodes(0, cursors);
        } else {
            rootField.insertNodes(0, cursors);
        }
    }

    public get root(): EditableField {
        return this.getRoot(false);
    }

    public set root(value: ContextuallyTypedNodeData | undefined) {
        this.unwrappedRoot = value;
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
