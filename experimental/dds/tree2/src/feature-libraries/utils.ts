/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { IJsonCodec } from "../codec";
import { RevisionTag, EncodedRevisionTag, ChangeAtomId, EncodedChangeAtomId } from "../core";

export function encodeChangeAtomId(
	revisionTagCodec: IJsonCodec<RevisionTag, EncodedRevisionTag>,
	changeAtomId: ChangeAtomId,
): EncodedChangeAtomId {
	if (changeAtomId.revision === undefined) {
		return { localId: changeAtomId.localId };
	}

	return {
		localId: changeAtomId.localId,
		revision: revisionTagCodec.encode(changeAtomId.revision),
	};
}

export function decodeChangeAtomId(
	revisionTagCodec: IJsonCodec<RevisionTag, EncodedRevisionTag>,
	changeAtomId: EncodedChangeAtomId,
): ChangeAtomId {
	if (changeAtomId.revision === undefined) {
		return { localId: changeAtomId.localId };
	}

	return {
		localId: changeAtomId.localId,
		revision: revisionTagCodec.decode(changeAtomId.revision),
	};
}
