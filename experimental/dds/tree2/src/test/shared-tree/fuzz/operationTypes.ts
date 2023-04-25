/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { FieldKey, UpPath } from "../../../core";

export type Operation = TreeOperation | Synchronize;

export type TreeOperation = TreeEdit | TransactionBoundary;

export interface TreeEdit {
	type: "edit";
	contents: FieldEdit | NodeEdit;
	index: number;
}

export interface Synchronize {
	type: "synchronize";
}

export interface TransactionBoundary {
	type: "transaction";
	contents: FuzzTransactionType;
	treeIndex: number;
}

export type FuzzFieldChange = FuzzInsert | FuzzDelete;

export interface FieldEdit {
	editType: "fieldEdit";
	change: SequenceFieldEdit; // in the future, add `| OptionalFieldEdit | ValueFieldEdit`
}

export interface FuzzInsert {
	type: "insert";
	parent: UpPath | undefined;
	field: FieldKey;
	index: number;
	value: number;
	treeIndex: number;
}

export interface SequenceFieldEdit {
	type: "sequence";
	edit: FuzzInsert | FuzzDelete;
}

export interface FuzzDelete extends NodeRangePath {
	type: "delete";
	treeIndex: number;
}

export type FuzzNodeEditChange = FuzzSetPayload;

export interface NodeEdit {
	editType: "nodeEdit";
	edit: FuzzNodeEditChange;
}

export interface FuzzSetPayload {
	nodeEditType: "setPayload";
	path: UpPath;
	value: number;
	treeIndex: number;
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

export interface NodeRangePath {
	firstNode: UpPath;
	count: number;
}

export interface EditGeneratorOpWeights {
	insert: number;
	delete: number;
	setPayload: number;
	start: number;
	commit: number;
	abort: number;
	synchronize: number;
}
