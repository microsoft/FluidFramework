/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { SessionId } from "@fluidframework/id-compressor";
import { SessionAwareCodec } from "../codec";
import { RevisionTag, EncodedRevisionTag, ChangeAtomId, EncodedChangeAtomId } from "../core";
import { Mutable } from "../util";

export function makeChangeAtomIdCodec(
	revisionTagCodec: SessionAwareCodec<RevisionTag, EncodedRevisionTag>,
): SessionAwareCodec<ChangeAtomId, EncodedChangeAtomId> {
	return {
		encode(changeAtomId: ChangeAtomId, originatorId: SessionId): EncodedChangeAtomId {
			return changeAtomId.revision === undefined
				? [changeAtomId.localId]
				: [
						changeAtomId.localId,
						revisionTagCodec.encode(changeAtomId.revision, originatorId),
				  ];
		},
		decode([localId, revision]: EncodedChangeAtomId, originatorId: SessionId): ChangeAtomId {
			const decoded: Mutable<ChangeAtomId> = { localId };
			if (revision !== undefined) {
				decoded.revision = revisionTagCodec.decode(revision, originatorId);
			}
			return decoded;
		},
	};
}
