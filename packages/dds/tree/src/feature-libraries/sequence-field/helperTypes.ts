/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import type { DiscriminatedUnionLibrary, IJsonCodec } from "../../codec/index.js";
import type {
	ChangeAtomId,
	ChangeDecodingContext,
	ChangeEncodingContext,
	EncodedRevisionTag,
	RevisionTag,
} from "../../core/index.js";
import type { EncodedChangeAtomId } from "../modular-schema/index.js";

import type {
	AttachAndDetach,
	CellId,
	CellMark,
	Detach,
	HasMarkFields,
	Mark,
	MoveIn,
	MoveOut,
} from "./types.js";

export type EmptyInputCellMark = Mark & DetachedCellMark;

export interface DetachedCellMark extends HasMarkFields {
	cellId: CellId;
}

export type EmptyOutputCellMark = CellMark<Detach | AttachAndDetach>;

export type MoveMarkEffect = MoveOut | MoveIn;
export type DetachOfRemovedNodes = Detach & { cellId: CellId };
export type CellRename = AttachAndDetach | DetachOfRemovedNodes;

export interface SequenceCodecHelpers<TDecodedMarkEffect, TEncodedMarkEffect extends object> {
	readonly changeAtomIdCodec: IJsonCodec<
		ChangeAtomId,
		EncodedChangeAtomId,
		EncodedChangeAtomId,
		ChangeEncodingContext,
		ChangeDecodingContext
	>;
	readonly markEffectCodec: IJsonCodec<
		TDecodedMarkEffect,
		TEncodedMarkEffect,
		TEncodedMarkEffect,
		ChangeEncodingContext,
		ChangeDecodingContext
	>;
	readonly decoderLibrary: DiscriminatedUnionLibrary<
		TEncodedMarkEffect,
		/* args */ [context: ChangeDecodingContext],
		TDecodedMarkEffect
	>;
	readonly decodeRevision: (
		encodedRevision: EncodedRevisionTag | undefined,
		context: ChangeDecodingContext,
	) => RevisionTag;
}
