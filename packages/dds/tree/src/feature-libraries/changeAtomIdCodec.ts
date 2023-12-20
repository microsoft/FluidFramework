/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { SessionId } from "@fluidframework/id-compressor";
import { SessionAwareCodec } from "../codec";
import { RevisionTag, EncodedRevisionTag, ChangeAtomId, EncodedChangeAtomId } from "../core";

export function makeChangeAtomIdCodec(
	revisionTagCodec: SessionAwareCodec<RevisionTag, EncodedRevisionTag>,
): SessionAwareCodec<ChangeAtomId, EncodedChangeAtomId> {
	return {
		encode(changeAtomId: ChangeAtomId, originatorId: SessionId): EncodedChangeAtomId {
			if (changeAtomId.revision === undefined) {
				return { localId: changeAtomId.localId };
			}

			return {
				localId: changeAtomId.localId,
				revision: revisionTagCodec.encode(changeAtomId.revision, originatorId),
			};
		},
		decode(changeAtomId: EncodedChangeAtomId, originatorId: SessionId): ChangeAtomId {
			if (changeAtomId.revision === undefined) {
				return { localId: changeAtomId.localId };
			}

			return {
				localId: changeAtomId.localId,
				revision: revisionTagCodec.decode(changeAtomId.revision, originatorId),
			};
		},
	};
}
