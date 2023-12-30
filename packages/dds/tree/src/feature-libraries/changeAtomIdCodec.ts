/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { SessionId } from "@fluidframework/id-compressor";
import { SessionAwareCodec } from "../codec/index.js";
import {
	RevisionTag,
	EncodedRevisionTag,
	ChangeAtomId,
	EncodedChangeAtomId,
} from "../core/index.js";

export function makeChangeAtomIdCodec(
	revisionTagCodec: SessionAwareCodec<RevisionTag, EncodedRevisionTag>,
): SessionAwareCodec<ChangeAtomId, EncodedChangeAtomId> {
	return {
		encode(changeAtomId: ChangeAtomId, originatorId: SessionId): EncodedChangeAtomId {
			return changeAtomId.revision === undefined
				? changeAtomId.localId
				: [
						changeAtomId.localId,
						revisionTagCodec.encode(changeAtomId.revision, originatorId),
				  ];
		},
		decode(changeAtomId: EncodedChangeAtomId, originatorId: SessionId): ChangeAtomId {
			return Array.isArray(changeAtomId)
				? {
						localId: changeAtomId[0],
						revision: revisionTagCodec.decode(changeAtomId[1], originatorId),
				  }
				: { localId: changeAtomId };
		},
	};
}
