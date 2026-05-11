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
	/**
	 * When true, encoders must not emit op-space compressed IDs that have not
	 * yet been finalized (i.e. negative integers). Instead, they emit the
	 * stable UUID form, which any reader can resolve without access to the
	 * originator's session state.
	 * @remarks
	 * Set by callers producing attach summaries (where the host runtime
	 * passes no `incrementalSummaryContext`): the resulting blob may be
	 * reused as a handle in later summaries, after which the originating
	 * session's local ID state is no longer available to readers.
	 *
	 * This flag is propagated transitively through the change codec stack
	 * (e.g. into `FieldBatchEncodingContext.idsMustBeFinalized` for builds
	 * and refreshers inside changesets).
	 */
	readonly idsMustBeFinalized?: boolean;
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
