/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { IJsonCodec } from "../codec";
import { RevisionTag } from "../core";

export class RevisionTagCodec implements IJsonCodec<RevisionTag, RevisionTag> {
	public encode(tag: RevisionTag) {
		return tag;
	}
	public decode(tag: RevisionTag) {
		return tag;
	}
}
