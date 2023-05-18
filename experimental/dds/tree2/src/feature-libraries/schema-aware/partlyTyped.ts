/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { FieldStoredSchema, ITreeCursor } from "../../core";
import { Optional, Sequence, ValueFieldKind } from "../defaultFieldKinds";
import { UntypedField } from "../untypedTree";

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
	 * The `FieldStoredSchema` of this field.
	 */
	readonly fieldSchema: FieldStoredSchema & {
		readonly kind: Sequence;
	};

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

/**
 * A value field in an {@link UntypedTree}.
 * @alpha
 */
export interface UntypedValueField extends UntypedField {
	/**
	 * The `FieldStoredSchema` of this field.
	 */
	readonly fieldSchema: FieldStoredSchema & {
		readonly kind: ValueFieldKind;
	};

	// TODO: add editing APIs
	// TODO: add friendly .child getter
}

/**
 * A value field in an {@link UntypedTree}.
 * @alpha
 */
export interface UntypedOptionalField extends UntypedField {
	/**
	 * The `FieldStoredSchema` of this field.
	 */
	readonly fieldSchema: FieldStoredSchema & {
		readonly kind: Optional;
	};

	// TODO: add editing APIs
	// TODO: add friendly .child getter
}
