/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import type { DiscriminatedUnionLibrary, IJsonCodec } from "../../codec/index.js";
import type {
	ChangeAtomId,
	ChangeEncodingContext,
	EncodedRevisionTag,
	RevisionTag,
} from "../../core/index.js";
import type {
	EncodedChangeAtomId,
	FieldChangeEncodingContext,
} from "../modular-schema/index.js";

import type { Attach, CellId, CellMark, Detach, HasMarkFields, Mark } from "./types.js";

export type EmptyInputCellMark = Mark & DetachedCellMark;

export interface DetachedCellMark extends HasMarkFields {
	cellId: CellId;
}

export type EmptyOutputCellMark = CellMark<Detach>;

export type MoveMarkEffect = Attach | Detach;
export type DetachOfRemovedNodes = Detach & { cellId: CellId };
export type CellRename = DetachOfRemovedNodes;

export interface SequenceCodecHelpers<TDecodedMarkEffect, TEncodedMarkEffect extends object> {
	readonly changeAtomIdCodec: IJsonCodec<
		ChangeAtomId,
		EncodedChangeAtomId,
		EncodedChangeAtomId,
		ChangeEncodingContext
	>;
	readonly markEffectCodec: IJsonCodec<
		TDecodedMarkEffect,
		TEncodedMarkEffect,
		TEncodedMarkEffect,
		FieldChangeEncodingContext
	>;
	readonly decoderLibrary: DiscriminatedUnionLibrary<
		TEncodedMarkEffect,
		/* args */ [context: ChangeEncodingContext],
		TDecodedMarkEffect
	>;
	readonly decodeRevision: (
		encodedRevision: EncodedRevisionTag | undefined,
		context: ChangeEncodingContext,
	) => RevisionTag;
}
