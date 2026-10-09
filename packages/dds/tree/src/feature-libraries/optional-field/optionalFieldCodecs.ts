/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import {
	eraseEncodedType,
	type ICodecFamily,
	type JsonCodecPart,
	makeCodecFamily,
} from "../../codec/index.js";
import type {
	ChangeEncodingContext,
	RevisionTag,
	RevisionTagSchema,
} from "../../core/index.js";
import type {
	FieldChangeEncodingContext,
	FieldChangeDecodingContext,
} from "../modular-schema/index.js";

import type { OptionalChangeset } from "./optionalFieldChangeTypes.js";
import { makeOptionalFieldCodec as makeV2Codec } from "./optionalFieldCodecV2.js";

export const makeOptionalFieldCodecFamily = (
	revisionTagCodec: JsonCodecPart<
		RevisionTag,
		typeof RevisionTagSchema,
		ChangeEncodingContext
	>,
): ICodecFamily<OptionalChangeset, FieldChangeEncodingContext, FieldChangeDecodingContext> =>
	makeCodecFamily([[2, eraseEncodedType(makeV2Codec(revisionTagCodec))]]);
