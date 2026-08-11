/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { assert } from "@fluidframework/core-utils/internal";
import type { IIdCompressor, SessionId } from "@fluidframework/id-compressor";

import type { JsonCodecPart } from "../../codec/index.js";
import type { ChangeEncodingContext } from "../change-family/index.js";

import { RevisionTagSchema, type EncodedRevisionTag, type RevisionTag } from "./types.js";

export class RevisionTagCodec
	implements JsonCodecPart<RevisionTag, typeof RevisionTagSchema, ChangeEncodingContext>
{
	public localSessionId: SessionId;
	public readonly encodedSchema = RevisionTagSchema;

	public constructor(private readonly idCompressor: IIdCompressor) {
		this.localSessionId = idCompressor.localSessionId;
	}

	public encode(tag: RevisionTag): EncodedRevisionTag {
		return tag === "root"
			? tag
			: (this.idCompressor.normalizeToOpSpace(tag) as EncodedRevisionTag);
	}
	public decode(tag: EncodedRevisionTag, context: ChangeEncodingContext): RevisionTag {
		if (tag === "root") {
			return tag;
		}

		assert(
			typeof tag === "number",
			0x88d /* String revision tag must be the literal 'root' */,
		);
		return this.idCompressor.normalizeToSessionSpace(tag, context.originatorId);
	}
}
