/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { ICodecFamily } from "../../codec";
import { ChangeRebaser } from "../rebase";
import { Delta } from "../tree";

export interface ChangeFamily<TEditor extends ChangeFamilyEditor, TChange> {
	buildEditor(changeReceiver: (change: TChange) => void): TEditor;

	/**
	 * @param change - The change to convert into a delta.
	 */
	intoDelta(change: TChange): Delta.Root;

	readonly rebaser: ChangeRebaser<TChange>;
	readonly codecs: ICodecFamily<TChange>;
}

export interface ChangeFamilyEditor {
	/**
	 * Must be called when a new transaction starts.
	 *
	 * Note: transactions are an optional feature. It is valid to make edits outside of a transaction.
	 *
	 * For each call to this function, a matching call to `exitTransaction` must be made at a later time.
	 * Can be called repeatedly to indicate the start of nesting transactions.
	 */
	enterTransaction(): void;

	/**
	 * Must be called when a transaction ends.
	 *
	 * Note: transactions are an optional feature. It is valid to make edits outside of a transaction.
	 *
	 * For each call to this function, a matching call to `enterTransaction` must be made at an earlier time.
	 * Can be called repeatedly to indicate the end of nesting transactions.
	 */
	exitTransaction(): void;
}
