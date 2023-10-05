/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { FieldKey, JsonableTree } from "../../../core";
import { DownPath } from "../../../feature-libraries";

export type Operation = TreeOperation | Synchronize;

export type TreeOperation = TreeEdit | TransactionBoundary | UndoRedo;

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

export type FuzzFieldChange = FuzzInsert | FuzzDelete;

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
	 * @privateRemarks - Optional fields use {@link FuzzDelete} to mean "delete the field's contents" rather than
	 * a `FuzzSet` with undefined value, hence why this property is required.
	 */
	value: JsonableTree;
}

export type FieldEditTypes = SequenceFieldEdit | RequiredFieldEdit | OptionalFieldEdit;

export interface SequenceFieldEdit {
	type: "sequence";
	edit: FuzzInsert | FuzzDelete;
}

export interface RequiredFieldEdit {
	type: "required";
	edit: FuzzSet;
}

export interface OptionalFieldEdit {
	type: "optional";
	edit: FuzzSet | FuzzDelete;
}

export interface FuzzDelete extends NodeRangePath {
	type: "delete";
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
	delete: number;
	start: number;
	commit: number;
	abort: number;
	synchronize: number;
}
