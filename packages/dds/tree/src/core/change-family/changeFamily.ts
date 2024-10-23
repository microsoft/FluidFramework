/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import type { IIdCompressor, SessionId } from "@fluidframework/id-compressor";

import type { ICodecFamily, IJsonCodec } from "../../codec/index.js";
import type { SchemaAndPolicy } from "../../core/index.js";
import type { JsonCompatibleReadOnly } from "../../util/index.js";
import type { ChangeRebaser, RevisionTag, TaggedChange } from "../rebase/index.js";

export interface ChangeFamily<TEditor extends ChangeFamilyEditor, TChange> {
	buildEditor(
		mintRevisionTag: () => RevisionTag,
		changeReceiver: (change: TaggedChange<TChange>) => void,
	): TEditor;

	readonly rebaser: ChangeRebaser<TChange>;
	readonly codecs: ICodecFamily<TChange, ChangeEncodingContext>;
}

export interface ChangeEncodingContext {
	readonly originatorId: SessionId;
	readonly revision: RevisionTag | undefined;
	readonly idCompressor: IIdCompressor;
	readonly schema?: SchemaAndPolicy;
}

export type ChangeFamilyCodec<TChange> = IJsonCodec<
	TChange,
	JsonCompatibleReadOnly,
	JsonCompatibleReadOnly,
	ChangeEncodingContext
>;

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
