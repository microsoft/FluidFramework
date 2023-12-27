/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { assert } from "@fluidframework/core-utils";
import { IIdCompressor, SessionId } from "@fluidframework/id-compressor";
import { IJsonCodec } from "../../codec/index.js";
import { EncodedRevisionTag, RevisionTag } from "./types.js";

export class RevisionTagCodec
	implements
		IJsonCodec<
			RevisionTag,
			EncodedRevisionTag,
			EncodedRevisionTag,
			{ originatorId: SessionId }
		>
{
	public constructor(private readonly idCompressor: IIdCompressor) {}

	public encode(tag: RevisionTag): EncodedRevisionTag {
		return tag === "root"
			? tag
			: (this.idCompressor.normalizeToOpSpace(tag) as EncodedRevisionTag);
	}
	public decode(tag: EncodedRevisionTag, context: { originatorId: SessionId }): RevisionTag {
		if (tag === "root") {
			return tag;
		}
		assert(typeof tag === "number", "String revision tag must be the literal 'root'");
		return this.idCompressor.normalizeToSessionSpace(tag, context.originatorId);
	}
}
