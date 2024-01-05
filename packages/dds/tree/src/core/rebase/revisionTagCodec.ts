/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { assert } from "@fluidframework/core-utils";
import { IIdCompressor, SessionId } from "@fluidframework/id-compressor";
import { SessionAwareCodec } from "../../codec";
import { EncodedRevisionTag, RevisionTag } from "./types";

export class RevisionTagCodec implements SessionAwareCodec<RevisionTag, EncodedRevisionTag> {
	public constructor(private readonly idCompressor: IIdCompressor) {}

	public encode(tag: RevisionTag): EncodedRevisionTag {
		return tag === "root"
			? tag
			: (this.idCompressor.normalizeToOpSpace(tag) as EncodedRevisionTag);
	}
	public decode(tag: EncodedRevisionTag, originatorId: SessionId): RevisionTag {
		if (tag === "root") {
			return tag;
		}
		assert(typeof tag === "number", 0x88d /* String revision tag must be the literal 'root' */);
		return this.idCompressor.normalizeToSessionSpace(tag, originatorId);
	}
}
