/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import {
	RevisionTag,
	EncodedRevisionTag,
	ChangeAtomId,
	EncodedChangeAtomId,
	ChangeEncodingContext,
} from "../core/index.js";
import { IJsonCodec } from "../codec/index.js";

export function makeChangeAtomIdCodec(
	revisionTagCodec: IJsonCodec<
		RevisionTag,
		EncodedRevisionTag,
		EncodedRevisionTag,
		ChangeEncodingContext
	>,
): IJsonCodec<ChangeAtomId, EncodedChangeAtomId, EncodedChangeAtomId, ChangeEncodingContext> {
	return {
		encode(changeAtomId: ChangeAtomId, context: ChangeEncodingContext): EncodedChangeAtomId {
			return changeAtomId.revision === undefined
				? changeAtomId.localId
				: [changeAtomId.localId, revisionTagCodec.encode(changeAtomId.revision, context)];
		},
		decode(changeAtomId: EncodedChangeAtomId, context: ChangeEncodingContext): ChangeAtomId {
			return Array.isArray(changeAtomId)
				? {
						localId: changeAtomId[0],
						revision: revisionTagCodec.decode(changeAtomId[1], context),
				  }
				: { localId: changeAtomId };
		},
	};
}
