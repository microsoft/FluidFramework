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
			const { localId, revision } = changeAtomId;
			if (revision === undefined || revision === context.revision) {
				return localId;
			}

			return [localId, revisionTagCodec.encode(revision, context)];
		},
		decode(changeAtomId: EncodedChangeAtomId, context: ChangeEncodingContext): ChangeAtomId {
			if (Array.isArray(changeAtomId)) {
				const [localId, encodedRevision] = changeAtomId;
				return {
					localId,
					revision: revisionTagCodec.decode(encodedRevision, context),
				};
			}

			return { localId: changeAtomId, revision: context.revision };
		},
		encodedSchema: EncodedChangeAtomId,
	};
}
