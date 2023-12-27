/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { SessionId } from "@fluidframework/id-compressor";
import {
	RevisionTag,
	EncodedRevisionTag,
	ChangeAtomId,
	EncodedChangeAtomId,
} from "../core/index.js";
import { IJsonCodec } from "../codec/index.js";

export function makeChangeAtomIdCodec(
	revisionTagCodec: IJsonCodec<
		RevisionTag,
		EncodedRevisionTag,
		EncodedRevisionTag,
		{ originatorId: SessionId }
	>,
): IJsonCodec<ChangeAtomId, EncodedChangeAtomId, EncodedChangeAtomId, { originatorId: SessionId }> {
	return {
		encode(
			changeAtomId: ChangeAtomId,
			context: { originatorId: SessionId },
		): EncodedChangeAtomId {
			return changeAtomId.revision === undefined
				? changeAtomId.localId
				: [changeAtomId.localId, revisionTagCodec.encode(changeAtomId.revision, context)];
		},
		decode(
			changeAtomId: EncodedChangeAtomId,
			context: { originatorId: SessionId },
		): ChangeAtomId {
			return Array.isArray(changeAtomId)
				? {
						localId: changeAtomId[0],
						revision: revisionTagCodec.decode(changeAtomId[1], context),
				  }
				: { localId: changeAtomId };
		},
	};
}
