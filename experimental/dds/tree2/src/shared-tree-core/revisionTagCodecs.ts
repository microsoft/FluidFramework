/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { assert } from "@fluidframework/core-utils";
import { IIdCompressor, SessionId } from "@fluidframework/runtime-definitions";
import { IJsonCodec } from "../codec";
import { EncodedRevisionTag, RevisionTag } from "../core";

export class RevisionTagCodec implements IJsonCodec<RevisionTag, EncodedRevisionTag> {
	public constructor(private readonly idCompressor?: IIdCompressor) {}

	public encode(tag: RevisionTag) {
		return tag as unknown as EncodedRevisionTag;
	}
	public decode(tag: EncodedRevisionTag, originatorId?: SessionId) {
		assert(
			originatorId !== undefined,
			"Origin SessionId must be provided to decode a revision tag",
		);
		return tag as unknown as RevisionTag;
	}
}
