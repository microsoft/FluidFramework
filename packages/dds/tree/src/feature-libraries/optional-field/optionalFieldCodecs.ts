/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { ICodecFamily, IJsonCodec, makeCodecFamily } from "../../codec/index.js";
import { ChangeEncodingContext, EncodedRevisionTag, RevisionTag } from "../../core/index.js";
import type { FieldChangeEncodingContext, NodeId } from "../modular-schema/index.js";

import type { OptionalChangeset } from "./optionalFieldChangeTypes.js";
import { makeOptionalFieldCodec as makeV0Codec } from "./optionalFieldCodecV0.js";
import { makeOptionalFieldCodec as makeV1Codec } from "./optionalFieldCodecV1.js";

export const makeOptionalFieldCodecFamily = <TChildChange = NodeId>(
	revisionTagCodec: IJsonCodec<
		RevisionTag,
		EncodedRevisionTag,
		EncodedRevisionTag,
		ChangeEncodingContext
	>,
): ICodecFamily<OptionalChangeset<TChildChange>, FieldChangeEncodingContext> =>
	makeCodecFamily([
		[0, makeV0Codec(revisionTagCodec)],
		[1, makeV1Codec(revisionTagCodec)],
	]);
