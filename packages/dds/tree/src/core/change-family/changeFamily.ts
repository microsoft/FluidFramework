/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import type { IIdCompressor, SessionId } from "@fluidframework/id-compressor";

import type { ICodecFamily, IJsonCodec } from "../../codec/index.js";
import type { SchemaAndPolicy } from "../../core/index.js";
import type { IdDecodingContext, JsonCompatibleReadOnly } from "../../util/index.js";
import type { ChangeRebaser, RevisionTag, TaggedChange } from "../rebase/index.js";

export type ProcessChangeFn<TChange, TChangeProcessingContext> =
	TChangeProcessingContext extends never
		? (change: TChange) => TChange
		: (change: TChange, context: TChangeProcessingContext) => TChange;

export interface ChangeFamily<
	TEditor extends ChangeFamilyEditor,
	TChange,
	// For simplicity, may be a concrete ChangeFamily implementation such as
	// ChangeFamilyFoo implements ChangeFamily<EditorFoo, ChangeFoo, ChangeFamilyFoo>
	// to provide all details and helpers that processFn for ChangeFoo
	// may require, but there is no requirement to follow that pattern.
	TChangeProcessingContext = never,
> {
	buildEditor(
		mintRevisionTag: () => RevisionTag,
		changeReceiver: (change: TaggedChange<TChange>) => void,
	): TEditor;

	readonly rebaser: ChangeRebaser<TChange>;
	readonly codecs: ICodecFamily<TChange, ChangeEncodingContext, ChangeDecodingContext>;

	buildProcessor(
		processFn: ProcessChangeFn<TChange, TChangeProcessingContext>,
	): (change: TChange) => TChange;
}

export interface ChangeEncodingContext {
	readonly originatorId: SessionId;
	readonly revision: RevisionTag | undefined;
	readonly idCompressor: IIdCompressor;
	readonly schema?: SchemaAndPolicy;
	/**
	 * `true` when this context is encoding to or decoding from a summary blob.
	 * `false` when this context is for an op (or any other non-summary path,
	 * including utility encoders that aren't tied to persistence).
	 *
	 * @remarks
	 * Used to gate decode-time recovery behavior — for example, healing of
	 * unresolvable identifier IDs — that should only run when loading a
	 * (possibly broken) attach-summary blob, never when applying ops.
	 */
	readonly isSummary: boolean;
}

/**
 * Context provided to change codecs when decoding.
 * @remarks
 * Carries two {@link IdDecodingContext}s, both built once at the decode entry point, replacing the
 * raw `originatorId`/`healing`/`isSummary` fields the encode context still carries for its own
 * (encode-time) purposes.
 *
 * {@link ChangeDecodingContext.idDecodingContext} resolves revision tags (and other change-atom
 * identifiers) using the originator session that produced the commit (per-commit for summaries, the
 * message session for ops).
 *
 * {@link ChangeDecodingContext.forestIdDecodingContext} resolves identifiers embedded in forest
 * chunks (detached-node builds/refreshers), which may reference multiple sessions and so use an
 * originatorless, heal-aware resolver for summaries. For ops the two contexts are identical.
 *
 * TODO: Revisit whether this split is still necessary. In particular: confirm revision tags are
 * decoded with the correct session id (and whether they should gain healing support like forest
 * identifiers have), and evaluate whether forest identifier decoding could instead use the
 * originator session id we already have (which would let both contexts collapse back into one).
 */
export interface ChangeDecodingContext {
	readonly revision: RevisionTag | undefined;
	readonly idCompressor: IIdCompressor;
	/**
	 * Resolves revision tags and other change-atom identifiers (originator-aware).
	 */
	readonly idDecodingContext: IdDecodingContext;
	/**
	 * Resolves identifiers embedded in forest chunks (originatorless + heal-aware for summaries).
	 */
	readonly forestIdDecodingContext: IdDecodingContext;
}

export type ChangeFamilyCodec<TChange> = IJsonCodec<
	TChange,
	JsonCompatibleReadOnly,
	JsonCompatibleReadOnly,
	ChangeEncodingContext,
	ChangeDecodingContext
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
