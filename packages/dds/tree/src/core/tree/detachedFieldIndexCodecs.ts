/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import type { IIdCompressor } from "@fluidframework/id-compressor";

import {
	type CodecWriteOptions,
	makeCodecFamily,
	makeVersionDispatchingCodec,
} from "../../codec/index.js";
import type { RevisionTagCodec } from "../rebase/index.js";

import { version1 } from "./detachedFieldIndexFormatV1.js";
import { makeDetachedNodeToFieldCodecV1 } from "./detachedFieldIndexCodecV1.js";

export function makeDetachedFieldIndexCodec(
	revisionTagCodec: RevisionTagCodec,
	options: CodecWriteOptions,
	idCompressor: IIdCompressor,
) {
	const family = makeCodecFamily([
		[version1, makeDetachedNodeToFieldCodecV1(revisionTagCodec, options, idCompressor)],
	]);
	return makeVersionDispatchingCodec(family, { ...options, writeVersion: version1 });
}
