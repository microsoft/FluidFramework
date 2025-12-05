/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { type IJsonCodec, makeCodecFamily, type ICodecFamily } from "../../codec/index.js";
import type {
	ChangeEncodingContext,
	EncodedRevisionTag,
	RevisionTag,
} from "../../core/index.js";
import type { FieldChangeEncodingContext } from "../modular-schema/index.js";

import { makeV2Codec } from "./sequenceFieldCodecV2.js";
import { makeV3Codec } from "./sequenceFieldCodecV3.js";
import type { Changeset, MarkList } from "./types.js";

export const sequenceFieldChangeCodecFactory = (
	revisionTagCodec: IJsonCodec<
		RevisionTag,
		EncodedRevisionTag,
		EncodedRevisionTag,
		ChangeEncodingContext
	>,
): ICodecFamily<MarkList, FieldChangeEncodingContext> =>
	makeCodecFamily<Changeset, FieldChangeEncodingContext>([
		[2, makeV2Codec(revisionTagCodec)],
		[3, makeV3Codec(revisionTagCodec)],
	]);
