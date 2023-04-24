/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { FieldKey, FieldSchema, ITreeCursor } from "../../core";
import { FieldEditor, FieldKind, Multiplicity } from "../modular-schema";
import { UntypedField, UntypedTree, UntypedTreeContext } from "../untypedTree";

/**
 * A sequence field in an {@link UntypedTree}.
 *
 * TODO:
 * insertNodes and replaceNodes should be made more strongly typed (and moved elsewhere)
 * and/or and API supporting more strongly typed data should be added (elsewhere).
 * @alpha
 */
export interface UntypedSequenceField extends UntypedField {
	/**
	 * The `FieldSchema` of this field.
	 */
	readonly fieldSchema: FieldSchema & {
		readonly kind: FieldKind<FieldEditor<any>, Multiplicity.Sequence>;
	};

	/**
	 * The `FieldKey` of this field.
	 */
	readonly fieldKey: FieldKey;

	/**
	 * The node which has this field on it under `fieldKey`.
	 * `undefined` iff this field is a detached field.
	 */
	readonly parent?: UntypedTree;

	/**
	 * A common context of a "forest" of EditableTrees.
	 */
	readonly context: UntypedTreeContext;

	/**
	 * Gets a node of this field by its index without unwrapping.
	 * Note that the node must exists at the given index.
	 */
	getNode(index: number): UntypedTree;

	/**
	 * Inserts new nodes into this field.
	 */
	insertNodes(index: number, newContent: ITreeCursor | ITreeCursor[]): void;

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
	replaceNodes(index: number, newContent: ITreeCursor | ITreeCursor[], count?: number): void;
}
