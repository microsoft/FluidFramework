/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { IIdCompressor } from "@fluidframework/runtime-definitions";
import { IJsonCodec } from "../codec";
import { RevisionTag } from "../core";

export class RevisionTagCodec implements IJsonCodec<RevisionTag, RevisionTag> {
	public constructor(private readonly idCompressor?: IIdCompressor) {}

	public encode(tag: RevisionTag) {
		return tag;
	}
	public decode(tag: RevisionTag) {
		return tag;
	}
}
