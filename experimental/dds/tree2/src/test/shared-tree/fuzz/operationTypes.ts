/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { FieldKey, UpPath } from "../../../core";

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
	parent: UpPath | undefined;
	field: FieldKey;
	index: number;
	value: number;
}

export type FieldEditTypes = SequenceFieldEdit | ValueFieldEdit | OptionalFieldEdit;

export interface SequenceFieldEdit {
	type: "sequence";
	edit: FuzzInsert | FuzzDelete;
}

export interface ValueFieldEdit {
	type: "value";
	edit: FuzzDelete;
}

export interface OptionalFieldEdit {
	type: "optional";
	edit: FuzzInsert | FuzzDelete;
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
	firstNode: UpPath;
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
