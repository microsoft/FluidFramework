/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { assert } from "@fluidframework/core-utils";
import { IIdCompressor } from "@fluidframework/id-compressor";
import { IJsonCodec } from "../../codec/index.js";
import { ChangeEncodingContext } from "../change-family/index.js";
import { EncodedRevisionTag, RevisionTag } from "./types.js";

export class RevisionTagCodec
	implements
		IJsonCodec<RevisionTag, EncodedRevisionTag, EncodedRevisionTag, ChangeEncodingContext>
{
	public constructor(private readonly idCompressor: IIdCompressor) {}

	public encode(tag: RevisionTag): EncodedRevisionTag {
		return tag === "root"
			? tag
			: (this.idCompressor.normalizeToOpSpace(tag) as EncodedRevisionTag);
	}
	public decode(tag: EncodedRevisionTag, context: ChangeEncodingContext): RevisionTag {
		if (tag === "root") {
			return tag;
		}
		assert(typeof tag === "number", "String revision tag must be the literal 'root'");
		return this.idCompressor.normalizeToSessionSpace(tag, context.originatorId);
	}
}
