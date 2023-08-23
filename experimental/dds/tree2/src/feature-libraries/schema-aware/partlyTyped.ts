/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { FieldStoredSchema, ITreeCursor } from "../../core";
import { ContextuallyTypedNodeData, NewFieldContent } from "../contextuallyTyped";
import { Optional, Sequence, ValueFieldKind } from "../default-field-kinds";
import {
	UntypedField,
	UntypedTree,
	UntypedTreeContext,
	UnwrappedUntypedTree,
} from "../untypedTree";

/**
 * A sequence field in an {@link UntypedTree}.
 *
 * TODO:
 * insertNodes and replaceNodes should be made more strongly typed (and moved elsewhere)
 * and/or and API supporting more strongly typed data should be added (elsewhere).
 * @alpha
 */
export interface UntypedSequenceField<
	TContext = UntypedTreeContext,
	TChild = UntypedTree<TContext>,
	TUnwrappedChild = UnwrappedUntypedTree<TContext>,
	TNewFieldContent = NewFieldContent,
> extends UntypedField<TContext, TChild, UntypedTree<TContext>, TUnwrappedChild> {
	/**
	 * The `FieldStoredSchema` of this field.
	 */
	readonly fieldSchema: FieldStoredSchema & {
		readonly kind: Sequence;
	};

	/**
	 * Inserts new nodes into this field.
	 */
	insertNodes(index: number, newContent: TNewFieldContent): void;

	/**
	 * Moves nodes from this field to destination iff both source and destination are sequence fields.
	 * If the destinationField is not provided, the current field is used as the destination.
	 */
	moveNodes(
		sourceIndex: number,
		count: number,
		destIndex: number,
		// TODO: make the destination type check somehow
		destinationField?: UntypedField,
	): void;

	/**
	 * Sequentially deletes the nodes from this field.
	 *
	 * @param index - the index of the first node to be deleted. It must be in a range of existing node indices.
	 * @param count - the number of nodes to be deleted. If not provided, deletes all nodes
	 * starting from the index and up to the length of the field.
	 */
	deleteNodes(index: number, count?: number): void;

	/**
	 * Sequentially replaces the nodes of this field.
	 *
	 * @param index - the index of the first node to be replaced. It must be in a range of existing node indices.
	 * @param count - the number of nodes to be replaced. If not provided, replaces all nodes
	 * starting from the index and up to the length of the field.
	 *
	 * Note that, if multiple clients concurrently call replace on a sequence field,
	 * all the insertions will be preserved.
	 */
	replaceNodes(index: number, newContent: TNewFieldContent, count?: number): void;

	/**
	 * Delete the content of this field.
	 */
	delete(): void;

	/**
	 * Sets the content of this field.
	 */
	setContent(newContent: TNewFieldContent): void;
}

/**
 * A value field in an {@link UntypedTree}.
 * @alpha
 */
export interface UntypedValueField<
	TContext = UntypedTreeContext,
	TChild = UntypedTree<TContext>,
	TUnwrappedChild = UnwrappedUntypedTree<TContext>,
	TNewContent = ContextuallyTypedNodeData,
> extends UntypedField<TContext, TChild, UntypedTree<TContext>, TUnwrappedChild> {
	/**
	 * The `FieldStoredSchema` of this field.
	 */
	readonly fieldSchema: FieldStoredSchema & {
		readonly kind: ValueFieldKind;
	};

	/**
	 * The child within this field.
	 *
	 * @remarks
	 * Does not unwrap the content.
	 */
	readonly content: TChild;

	/**
	 * Sets the content of this field.
	 */
	setContent(newContent: ITreeCursor | TNewContent): void;
}

/**
 * A value field in an {@link UntypedTree}.
 * @alpha
 */
export interface UntypedOptionalField<
	TContext = UntypedTreeContext,
	TChild = UntypedTree<TContext>,
	TUnwrappedChild = UnwrappedUntypedTree<TContext>,
> extends UntypedField<TContext, TChild, UntypedTree<TContext>, TUnwrappedChild> {
	/**
	 * The `FieldStoredSchema` of this field.
	 */
	readonly fieldSchema: FieldStoredSchema & {
		readonly kind: Optional;
	};

	/**
	 * Delete the content of this field.
	 */
	delete(): void;

	/**
	 * The child within this field.
	 *
	 * @remarks
	 * Does not unwrap the content.
	 */
	readonly content: TChild;

	/**
	 * Sets the content of this field.
	 */
	setContent(newContent: ITreeCursor | ContextuallyTypedNodeData | undefined): void;
}
