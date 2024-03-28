/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { FieldKey, JsonableTree } from "../../../core/index.js";
import { DownPath } from "../../../feature-libraries/index.js";

export type Operation = TreeOperation | Synchronize;

export type TreeOperation = TreeEdit | TransactionBoundary | UndoRedo | SchemaChange;

export interface TreeEdit {
	type: "edit";
	contents: FieldEdit;
}

export interface TransactionBoundary {
	type: "transaction";
	contents: FuzzTransactionType;
}

export interface UndoRedo {
	type: "undoRedo";
	contents: FuzzUndoRedoType;
}

export interface SchemaChange {
	type: "schema";
	contents: SchemaOp;
}

export interface FieldEdit {
	type: "fieldEdit";
	change: FieldEditTypes;
	/** The field being edited */
	field: FieldDownPath;
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

export interface FuzzInsert {
	type: "insert";
	/**
	 * Index to insert at within the field.
	 */
	index: number;
	content: JsonableTree[];
}

export interface FuzzSet {
	type: "set";
	/**
	 * @privateRemarks - Optional fields use {@link FuzzClear} to mean "remove the field's contents" rather than
	 * a `FuzzSet` with undefined value, hence why this property is required.
	 */
	value: JsonableTree;
}

export type FieldEditTypes = SequenceFieldEdit | RequiredFieldEdit | OptionalFieldEdit;

export interface SequenceFieldEdit {
	type: "sequence";
	edit: FuzzInsert | FuzzRemove | IntraFieldMove;
}

export interface RequiredFieldEdit {
	type: "required";
	edit: FuzzSet;
}

export interface OptionalFieldEdit {
	type: "optional";
	edit: FuzzSet | FuzzClear;
}

export interface FuzzRemove {
	type: "remove";
	range: NodeRange;
}

export interface FuzzClear {
	type: "clear";
}

export interface FuzzMove {
	/**
	 * The nodes to move.
	 */
	range: NodeRange;
	/**
	 * The index (pre-move) to move the content to.
	 */
	dstIndex: number;
}

export interface IntraFieldMove extends FuzzMove {
	type: "intra-field move";
}

export type FuzzTransactionType = TransactionStartOp | TransactionAbortOp | TransactionCommitOp;

export interface TransactionStartOp {
	fuzzType: "transactionStart";
}

export interface TransactionCommitOp {
	fuzzType: "transactionCommit";
}

export interface TransactionAbortOp {
	fuzzType: "transactionAbort";
}

export type FuzzUndoRedoType = UndoOp | RedoOp;

export interface UndoOp {
	type: "undo";
}

export interface RedoOp {
	type: "redo";
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

export interface EditGeneratorOpWeights {
	insert: number;
	remove: number;
	start: number;
	commit: number;
	abort: number;
	synchronize: number;
}
