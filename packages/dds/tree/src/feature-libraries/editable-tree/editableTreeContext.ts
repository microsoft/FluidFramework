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
	SchemaDataAndPolicy,
	ForestEvents,
} from "../../core";
import { ISubscribable } from "../../events";
import { DefaultChangeset, DefaultEditBuilder } from "../defaultChangeFamily";
import { runSynchronousTransaction } from "../defaultTransaction";
import { singleMapTreeCursor } from "../mapTreeCursor";
import { ProxyTarget, EditableField, proxifyField, UnwrappedEditableField } from "./editableTree";
import { applyFieldTypesFromContext, ContextuallyTypedNodeData } from "./utilities";

/**
 * A common context of a "forest" of EditableTrees.
 * It handles group operations like transforming cursors into anchors for edits.
 */
export interface EditableTreeContext extends ISubscribable<ForestEvents> {
	/**
	 * Gets or sets the root field of the tree.
	 *
	 * When using its setter, the input data must be formed depending
	 * on a multiplicity of the field, on if it's polymorphic or not and, for non-sequence multiplicities,
	 * on if the field's node declares its primary function by means of a primary field (see `getPrimaryField`):
	 * - For `Sequence` multiplicities and "primary fielded" nodes, an array of a {@link ContextuallyTypedNodeData}
	 * or an {@link EditableField} is expected.
	 * Use an empty array to delete all nodes of a sequence field.
	 * - For `Optional` multiplicities, `ContextuallyTypedNodeDataObject | undefined` is expected.
	 * If the input data is `undefined`, the field node will be deleted if it exists.
	 * - For `Value` multiplicities, `ContextuallyTypedNodeDataObject` is expected.
	 *
	 * A `PrimitiveValue` can be used instead of a `ContextuallyTypedNodeDataObject`
	 * to create/replace or to set the value of the primitive node
	 * if the field is a non-sequence and some of its types declare to follow
	 * the `String`, `Number` or `Boolean` value schema (see `ValueSchema`).
	 * For this to work, it must be possible to resolve the node type by unambiguously matching
	 * a basic TypeScript type of the input data to one of the types allowed by the field,
	 * or, if the field types are undefined, to one of the types available in the global tree schema.
	 * If it's not possible, a `ContextuallyTypedNodeDataObject` with an explicitly provided
	 * type and a value (using a `typeNameSymbol` and a `valueSymbol`) must be used instead.
	 *
	 * Note that currently a setter implementation replaces the nodes and not the field itself,
	 * as this is the only option available in the low-level editing API.
	 * Replacing the nodes has different merge semantics than replacing the field:
	 * it should not overwrite concurrently inserted content while replacing the field should.
	 * This might be changed in the future once the low-level editing API is available.
	 */
	get root(): EditableField;

	set root(data: ContextuallyTypedNodeData | undefined);

	/**
	 * Gets or sets the root field of the tree.
	 *
	 * When using its getter, see {@link UnwrappedEditableField} for what is unwrapped.
	 *
	 * Currently, its setter works exactly the same way as {@link EditableTreeContext.root},
	 * but it might be changed in the future once the low-level editing API
	 * for `replaceField` will become available.
	 */
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
}

/**
 * Implementation of `EditableTreeContext`.
 *
 * `transactionCheckout` is required to edit the EditableTrees.
 */
export class ProxyContext implements EditableTreeContext {
	public readonly withCursors: Set<ProxyTarget<Anchor | FieldAnchor>> = new Set();
	public readonly withAnchors: Set<ProxyTarget<Anchor | FieldAnchor>> = new Set();

	private readonly eventUnregister: (() => void)[];

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
		this.eventUnregister = [
			this.forest.on("beforeDelta", () => {
				this.prepareForEdit();
			}),
		];
	}

	public prepareForEdit(): void {
		for (const target of this.withCursors) {
			target.prepareForEdit();
		}
		assert(this.withCursors.size === 0, 0x3c0 /* prepareForEdit should remove all cursors */);
	}

	public free(): void {
		this.clear();
		for (const unregister of this.eventUnregister) {
			unregister();
		}
		this.eventUnregister.length = 0;
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
		// Note that an implementation of `set root` might change in the future,
		// see a comment in there regarding the `replaceNodes` and `replaceField` semantics.
		// This setter might want to keep the `replaceNodes` semantics for the cases when the root is unwrapped,
		// and use `replaceField` only if the root is a sequence field i.e.
		// it's unwrapped to the field itself.
		// TODO: update implementation once the low-level editing API is available.
		this.root = value;
	}

	public get root(): EditableField {
		return this.getRoot(false);
	}

	public set root(value: ContextuallyTypedNodeData | undefined) {
		const rootField = this.getRoot(false);
		const mapTrees = applyFieldTypesFromContext(this.schema, rootField.fieldSchema, value);
		const cursors = mapTrees.map(singleMapTreeCursor);
		// `replaceNodes` has different merge semantics than the `replaceField` would ideally offer:
		// `replaceNodes` should not overwrite concurrently inserted content while `replaceField` should.
		// We currently use `replaceNodes` here because the low-level editing API
		// for the desired `replaceField` semantics is not yet avaialble.
		// TODO: update implementation once the low-level editing API is available.
		rootField.replaceNodes(0, cursors);
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

	public on<K extends keyof ForestEvents>(eventName: K, listener: ForestEvents[K]): () => void {
		return this.forest.on(eventName, listener);
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
