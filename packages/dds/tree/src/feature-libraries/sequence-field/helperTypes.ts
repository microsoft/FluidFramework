/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import type { DiscriminatedUnionLibrary, IJsonCodec } from "../../codec/index.js";
import type {
	ChangeAtomId,
	ChangeDecodingContext,
	ChangeEncodingContext,
	EncodedChangeAtomId,
	EncodedRevisionTag,
	RevisionTag,
} from "../../core/index.js";
import type {
	FieldChangeDecodingContext,
	FieldChangeEncodingContext,
} from "../modular-schema/index.js";

import type { Encoded } from "./formatV2.js";
import type {
	Attach,
	CellId,
	CellMark,
	Detach,
	HasMarkFields,
	Mark,
	MarkEffect,
} from "./types.js";

export type EmptyInputCellMark = Mark & DetachedCellMark;

export interface DetachedCellMark extends HasMarkFields {
	cellId: CellId;
}

export type EmptyOutputCellMark = CellMark<Detach>;

export type MoveMarkEffect = Attach | Detach;
export type DetachOfRemovedNodes = Detach & { cellId: CellId };
export type CellRename = DetachOfRemovedNodes;

export interface SequenceCodecHelpers {
	readonly changeAtomIdCodec: IJsonCodec<
		ChangeAtomId,
		EncodedChangeAtomId,
		EncodedChangeAtomId,
		ChangeEncodingContext
	>;

	readonly encodeMarkEffect: (
		mark: Mark,
		context: FieldChangeEncodingContext,
	) => Encoded.MarkEffect;

	readonly decodeMarkEffect: (
		encoded: Encoded.MarkEffect,
		count: number,
		cellId: ChangeAtomId | undefined,
		context: FieldChangeDecodingContext,
	) => MarkEffect;

	readonly decodeRevision: (
		encodedRevision: EncodedRevisionTag | undefined,
		context: ChangeDecodingContext,
	) => RevisionTag;

	readonly decoderLibrary: DiscriminatedUnionLibrary<
		Encoded.MarkEffect,
		/* args */ [
			count: number,
			cellId: ChangeAtomId | undefined,
			context: FieldChangeDecodingContext,
		],
		MarkEffect
	>;
}
