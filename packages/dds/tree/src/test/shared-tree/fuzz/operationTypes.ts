/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { FieldKey, JsonableTree } from "../../../core/index.js";
import { DownPath } from "../../../feature-libraries/index.js";

export type Operation = TreeOperation | Synchronize;

export type TreeOperation = TreeEdit | TransactionBoundary | UndoRedo | FuzzSchemaChange;

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

export interface FuzzSchemaChange {
	type: "schema";
	contents: FuzzSchemaOp;
}

export type FuzzFieldChange = FuzzInsert | FuzzRemove | FuzzMove;

export interface FieldEdit {
	type: "fieldEdit";
	change: FieldEditTypes;
}

export interface FuzzInsert {
	type: "insert";
	/**
	 * DownPath to the field's parent node. Undefined iff this is the root trait.
	 */
	parent: DownPath | undefined;
	/**
	 * Key on the parent node corresponding to this field.
	 */
	key: FieldKey;
	/**
	 * Index to insert within the field.
	 */
	index: number;
	value: JsonableTree;
}

export interface FuzzSet {
	type: "set";
	/**
	 * DownPath to the field's parent node. Undefined iff this is the root trait.
	 */
	parent: DownPath | undefined;
	/**
	 * Key on the parent node corresponding to this field.
	 */
	key: FieldKey;
	/**
	 * @privateRemarks - Optional fields use {@link FuzzRemove} to mean "remove the field's contents" rather than
	 * a `FuzzSet` with undefined value, hence why this property is required.
	 */
	value: JsonableTree;
}

export type FieldEditTypes = SequenceFieldEdit | RequiredFieldEdit | OptionalFieldEdit;

export interface SequenceFieldEdit {
	type: "sequence";
	edit: FuzzInsert | FuzzRemove | FuzzMove;
}

export interface RequiredFieldEdit {
	type: "required";
	edit: FuzzSet;
}

export interface OptionalFieldEdit {
	type: "optional";
	edit: FuzzSet | FuzzRemove;
}

export interface FuzzRemove extends NodeRangePath {
	type: "remove";
}

export interface FuzzMove extends NodeRangePath {
	type: "move";
	/**
	 * The index (pre-move) to move the sequence to.
	 */
	dstIndex: number;
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

export interface FuzzSchemaOp {
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
