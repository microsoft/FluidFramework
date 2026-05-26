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

import type { OptionalChangeset } from "./optionalFieldChangeTypes.js";
import { makeOptionalFieldCodec as makeV2Codec } from "./optionalFieldCodecV2.js";

export const makeOptionalFieldCodecFamily = (
	revisionTagCodec: JsonCodecPart<
		RevisionTag,
		typeof RevisionTagSchema,
		ChangeEncodingContext
	>,
): ICodecFamily<OptionalChangeset, FieldChangeEncodingContext> =>
	makeCodecFamily([[2, makeV2Codec(revisionTagCodec)]]);
