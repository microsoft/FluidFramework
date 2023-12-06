/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { IIdCompressor } from "@fluidframework/runtime-definitions";
import { IJsonCodec } from "../codec";
import { EncodedRevisionTag, RevisionTag } from "../core";

export class RevisionTagCodec implements IJsonCodec<RevisionTag, EncodedRevisionTag> {
	public constructor(private readonly idCompressor?: IIdCompressor) {}

	public encode(tag: RevisionTag) {
		return tag as unknown as EncodedRevisionTag;
	}
	public decode(tag: EncodedRevisionTag) {
		return tag as unknown as RevisionTag;
	}
}
