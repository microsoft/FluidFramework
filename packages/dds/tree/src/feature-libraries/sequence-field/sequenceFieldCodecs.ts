/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { type ICodecFamily, type JsonCodecPart, makeCodecFamily } from "../../codec/index.js";
import type {
	ChangeEncodingContext,
	RevisionTag,
	RevisionTagSchema,
} from "../../core/index.js";
import type { FieldChangeEncodingContext } from "../modular-schema/index.js";

import { makeV2Codec } from "./sequenceFieldCodecV2.js";
import { makeV3Codec } from "./sequenceFieldCodecV3.js";
import type { MarkList } from "./types.js";

export function sequenceFieldChangeCodecFactory(
	revisionTagCodec: JsonCodecPart<
		RevisionTag,
		typeof RevisionTagSchema,
		ChangeEncodingContext
	>,
): ICodecFamily<MarkList, FieldChangeEncodingContext> {
	return makeCodecFamily<MarkList, FieldChangeEncodingContext>([
		[2, makeV2Codec(revisionTagCodec)],
		[3, makeV3Codec(revisionTagCodec)],
	]);
}
