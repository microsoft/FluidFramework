/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { type ICodecFamily, type IJsonCodec, makeCodecFamily } from "../../codec/index.js";
import type {
	ChangeEncodingContext,
	EncodedRevisionTag,
	RevisionTag,
} from "../../core/index.js";
import type { FieldChangeEncodingContext } from "../modular-schema/index.js";

import type { OptionalChangeset } from "./optionalFieldChangeTypes.js";
import { makeOptionalFieldCodec as makeV1Codec } from "./optionalFieldCodecV1.js";
import { makeOptionalFieldCodec as makeV2Codec } from "./optionalFieldCodecV2.js";

export const makeOptionalFieldCodecFamily = (
	revisionTagCodec: IJsonCodec<
		RevisionTag,
		EncodedRevisionTag,
		EncodedRevisionTag,
		ChangeEncodingContext
	>,
): ICodecFamily<OptionalChangeset, FieldChangeEncodingContext> =>
	makeCodecFamily([
		[1, makeV1Codec(revisionTagCodec)],
		[2, makeV2Codec(revisionTagCodec)],
	]);
