/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { assert } from "@fluidframework/core-utils/internal";
import type { IIdCompressor, SessionId } from "@fluidframework/id-compressor";
import { isStableId } from "@fluidframework/id-compressor/internal";

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

	public encode(tag: RevisionTag, context: ChangeEncodingContext): EncodedRevisionTag {
		if (tag === "root") {
			return tag;
		}
		const opSpaceId = this.idCompressor.normalizeToOpSpace(tag);
		// In contexts that require finalization (see `ChangeEncodingContext.idsMustBeFinalized`),
		// a negative op-space ID would be unresolvable by clients loading the blob after the
		// originating session's local state is gone. Emit the stable UUID instead.
		if (context.idsMustBeFinalized === true && opSpaceId < 0) {
			return this.idCompressor.decompress(tag) as EncodedRevisionTag;
		}
		return opSpaceId as EncodedRevisionTag;
	}
	public decode(tag: EncodedRevisionTag, context: ChangeEncodingContext): RevisionTag {
		if (tag === "root") {
			return tag;
		}
		if (typeof tag === "string") {
			assert(
				isStableId(tag),
				0x88d /* String revision tag must be 'root' or a stable UUID */,
			);
			return this.idCompressor.recompress(tag);
		}
		return this.idCompressor.normalizeToSessionSpace(tag, context.originatorId);
	}
}
