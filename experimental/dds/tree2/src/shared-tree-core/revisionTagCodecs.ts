/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { IIdCompressor, SessionId } from "@fluidframework/id-compressor";
import { SessionAwareCodec } from "../codec";
import { EncodedRevisionTag, RevisionTag } from "../core";

export class RevisionTagCodec implements SessionAwareCodec<RevisionTag, EncodedRevisionTag> {
	public constructor(private readonly idCompressor: IIdCompressor) {}

	public encode(tag: RevisionTag) {
		return this.idCompressor.normalizeToOpSpace(tag) as EncodedRevisionTag;
	}
	public decode(tag: EncodedRevisionTag, originatorId: SessionId) {
		return this.idCompressor.normalizeToSessionSpace(tag, originatorId);
	}
}
