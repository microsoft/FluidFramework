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
		assert(
			this.idCompressor !== undefined,
			"IdCompressor must be provided to encode a revision tag",
		);
		return this.idCompressor.normalizeToOpSpace(tag) as EncodedRevisionTag;
	}
	public decode(tag: EncodedRevisionTag, originatorId?: SessionId) {
		assert(
			originatorId !== undefined,
			"Origin SessionId must be provided to decode a revision tag",
		);
		assert(
			this.idCompressor !== undefined,
			"IdCompressor must be provided to encode a revision tag",
		);
		return this.idCompressor.normalizeToSessionSpace(tag, originatorId);
	}
}
