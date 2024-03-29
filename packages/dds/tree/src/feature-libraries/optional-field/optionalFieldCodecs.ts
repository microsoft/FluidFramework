/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { ICodecFamily, IJsonCodec, makeCodecFamily, unitCodec } from "../../codec/index.js";
import { ChangeEncodingContext, EncodedRevisionTag, RevisionTag } from "../../core/index.js";
import { JsonCompatibleReadOnly } from "../../util/index.js";
import type { NodeChangeset } from "../modular-schema/index.js";

import type { OptionalChangeset } from "./optionalFieldChangeTypes.js";
import { makeOptionalFieldCodec as makeV0Codec } from "./optionalFieldCodecV0.js";
import { makeOptionalFieldCodec as makeV1Codec } from "./optionalFieldCodecV1.js";

export const noChangeCodecFamily: ICodecFamily<0, ChangeEncodingContext> = makeCodecFamily<
	0,
	ChangeEncodingContext
>([[0, unitCodec]]);

export const makeOptionalFieldCodecFamily = <TChildChange = NodeChangeset>(
	childCodec: IJsonCodec<
		TChildChange,
		JsonCompatibleReadOnly,
		JsonCompatibleReadOnly,
		ChangeEncodingContext
	>,
	revisionTagCodec: IJsonCodec<
		RevisionTag,
		EncodedRevisionTag,
		EncodedRevisionTag,
		ChangeEncodingContext
	>,
): ICodecFamily<OptionalChangeset<TChildChange>, ChangeEncodingContext> =>
	makeCodecFamily([
		[0, makeV0Codec(childCodec, revisionTagCodec)],
		[1, makeV1Codec(childCodec, revisionTagCodec)],
	]);
