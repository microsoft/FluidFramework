/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import type { IIdCompressor } from "@fluidframework/id-compressor";

import {
	type CodecWriteOptions,
	FluidClientVersion,
	type ICodecFamily,
	type IJsonCodec,
	makeCodecFamily,
	makeVersionDispatchingCodec,
} from "../../codec/index.js";
import type { RevisionTagCodec } from "../rebase/index.js";

import { version1 } from "./detachedFieldIndexFormatV1.js";
import { version2 } from "./detachedFieldIndexFormatV2.js";
import { makeDetachedNodeToFieldCodecV1 } from "./detachedFieldIndexCodecV1.js";
import { makeDetachedNodeToFieldCodecV2 } from "./detachedFieldIndexCodecV2.js";
import type { DetachedFieldSummaryData } from "./detachedFieldIndexTypes.js";

export function makeDetachedFieldIndexCodec(
	revisionTagCodec: RevisionTagCodec,
	options: CodecWriteOptions,
	idCompressor: IIdCompressor,
): IJsonCodec<DetachedFieldSummaryData> {
	const family = makeDetachedFieldIndexCodecFamily(revisionTagCodec, options, idCompressor);
	const writeVersion =
		options.oldestCompatibleClient < FluidClientVersion.v2_52 ? version1 : version2;
	return makeVersionDispatchingCodec(family, { ...options, writeVersion });
}

export function makeDetachedFieldIndexCodecFamily(
	revisionTagCodec: RevisionTagCodec,
	options: CodecWriteOptions,
	idCompressor: IIdCompressor,
): ICodecFamily<DetachedFieldSummaryData> {
	return makeCodecFamily([
		[version1, makeDetachedNodeToFieldCodecV1(revisionTagCodec, options, idCompressor)],
		[version2, makeDetachedNodeToFieldCodecV2(revisionTagCodec, options, idCompressor)],
	]);
}
