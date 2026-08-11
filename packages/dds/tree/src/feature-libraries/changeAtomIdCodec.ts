/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import type { JsonCodecPart } from "../codec/index.js";
import type {
	ChangeAtomId,
	ChangeEncodingContext,
	RevisionTag,
	RevisionTagSchema,
} from "../core/index.js";

import { EncodedChangeAtomId } from "./modular-schema/index.js";

export function makeChangeAtomIdCodec(
	revisionTagCodec: JsonCodecPart<
		RevisionTag,
		typeof RevisionTagSchema,
		ChangeEncodingContext
	>,
): JsonCodecPart<ChangeAtomId, typeof EncodedChangeAtomId, ChangeEncodingContext> {
	return {
		encode(changeAtomId: ChangeAtomId, context: ChangeEncodingContext): EncodedChangeAtomId {
			return changeAtomId.revision === undefined || changeAtomId.revision === context.revision
				? changeAtomId.localId
				: [changeAtomId.localId, revisionTagCodec.encode(changeAtomId.revision, context)];
		},
		decode(changeAtomId: EncodedChangeAtomId, context: ChangeEncodingContext): ChangeAtomId {
			return Array.isArray(changeAtomId)
				? {
						localId: changeAtomId[0],
						revision: revisionTagCodec.decode(changeAtomId[1], context),
					}
				: { localId: changeAtomId, revision: context.revision };
		},
		encodedSchema: EncodedChangeAtomId,
	};
}
