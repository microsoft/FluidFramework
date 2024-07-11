/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import type { FieldKey, JsonableTree } from "../../../core/index.js";
import type { DownPath } from "../../../feature-libraries/index.js";

export type Operation = TreeOperation | Synchronize;

export type TreeOperation =
	| TreeEdit
	| TransactionBoundary
	| UndoRedo
	| SchemaChange
	| Constraint;

export interface TreeEdit {
	type: "treeEdit";
	edit: FieldEdit;
}

// Currently only node constraints are supported, but more constraint types may be added in the future.
export interface Constraint {
	type: "constraint";
	content: NodeConstraint;
}
export interface NodeConstraint {
	type: "nodeConstraint";
	/** Undefined when it is the parent of a detached field. */
	path: undefined | DownPath;
}
export interface TransactionBoundary {
	type: "transactionBoundary";
	boundary: "start" | "abort" | "commit";
}

export interface UndoRedo {
	type: "undoRedo";
	operation: "undo" | "redo";
}

export interface SchemaChange {
	type: "schemaChange";
	operation: SchemaOp;
}

export interface FieldEdit {
	type: "fieldEdit";
	/** The field being edited */
	field: FieldDownPath;
	/** The edit performed on the field */
	change: SequenceFieldEdit | RequiredFieldEdit | OptionalFieldEdit;
}

export interface Insert {
	type: "insert";
	/**
	 * Index to insert at within the field.
	 */
	index: number;
	content: JsonableTree[];
}

export interface SetField {
	type: "set";
	/**
	 * @privateRemarks - Optional fields use {@link ClearField} to mean "remove the field's contents" rather than
	 * a `SetField` with undefined value, hence why this property is required.
	 */
	value: JsonableTree;
}

export interface SequenceFieldEdit {
	type: "sequence";
	edit: Insert | Remove | IntraFieldMove | CrossFieldMove;
}

export interface RequiredFieldEdit {
	type: "required";
	edit: SetField;
}

export interface OptionalFieldEdit {
	type: "optional";
	edit: SetField | ClearField;
}

export interface Remove {
	type: "remove";
	range: NodeRange;
}

export interface ClearField {
	type: "clear";
}

export interface Move {
	/**
	 * The nodes to move.
	 */
	range: NodeRange;
	/**
	 * The index (pre-move) to move the content to.
	 */
	dstIndex: number;
}

export interface IntraFieldMove extends Move {
	type: "intraFieldMove";
}

export interface CrossFieldMove extends Move {
	type: "crossFieldMove";
	/**
	 * The field to move the content to.
	 * May be the same as the source field.
	 */
	dstField: FieldDownPath;
}

export interface SchemaOp {
	type: string;
}

/**
 * This Synchronize interface was duplicated from the ddsFuzzHarness code for use cases which requires more control over how the synchronize op is generated.
 */
export interface Synchronize {
	type: "synchronizeTrees";
}

export interface NodeRangePath {
	firstNode: DownPath;
	count: number;
}

export interface FieldDownPath {
	/**
	 * The field's parent node. Undefined when targeting the root field.
	 */
	parent: DownPath | undefined;
	/**
	 * Key on the parent node corresponding to this field.
	 */
	key: FieldKey;
}

export interface NodeRange {
	/**
	 * The index of the first node in the range
	 * Must be less-than or equal to `last`.
	 */
	first: number;
	/**
	 * The index of the last node in the range.
	 * Must be greater-than or equal to `first`.
	 */
	last: number;
}
