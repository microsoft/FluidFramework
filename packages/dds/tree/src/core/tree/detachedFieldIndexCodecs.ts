/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import type { IIdCompressor } from "@fluidframework/id-compressor";
import type { MinimumVersionForCollab } from "@fluidframework/runtime-definitions/internal";
import {
	getConfigForMinVersionForCollab,
	lowestMinVersionForCollab,
} from "@fluidframework/runtime-utils/internal";

import {
	type CodecTree,
	type CodecWriteOptions,
	FluidClientVersion,
	type ICodecFamily,
	type IJsonCodec,
	makeCodecFamily,
	makeVersionDispatchingCodec,
} from "../../codec/index.js";
import type { RevisionTagCodec } from "../rebase/index.js";

import { makeDetachedNodeToFieldCodecV1 } from "./detachedFieldIndexCodecV1.js";
import { makeDetachedNodeToFieldCodecV2 } from "./detachedFieldIndexCodecV2.js";
import type { DetachedFieldSummaryData } from "./detachedFieldIndexTypes.js";
import { DetachedFieldIndexFormatVersion } from "./detachedFieldIndexFormatCommon.js";
import { brand } from "../../util/index.js";

/**
 * Convert a MinimumVersionForCollab to a version for detached field codecs.
 * @param clientVersion - The MinimumVersionForCollab to convert.
 * @returns The detached field codec version that corresponds to the provided MinimumVersionForCollab.
 */
function clientVersionToDetachedFieldVersion(
	clientVersion: MinimumVersionForCollab,
): DetachedFieldIndexFormatVersion {
	return brand(
		getConfigForMinVersionForCollab(clientVersion, {
			[lowestMinVersionForCollab]: DetachedFieldIndexFormatVersion.v1,
			[FluidClientVersion.v2_52]: DetachedFieldIndexFormatVersion.v2,
		}),
	);
}

export function makeDetachedFieldIndexCodec(
	revisionTagCodec: RevisionTagCodec,
	options: CodecWriteOptions,
	idCompressor: IIdCompressor,
): IJsonCodec<DetachedFieldSummaryData> {
	const family = makeDetachedFieldIndexCodecFamily(revisionTagCodec, options, idCompressor);
	return makeVersionDispatchingCodec(family, {
		...options,
		writeVersion: clientVersionToDetachedFieldVersion(options.minVersionForCollab),
	});
}

export function makeDetachedFieldIndexCodecFamily(
	revisionTagCodec: RevisionTagCodec,
	options: CodecWriteOptions,
	idCompressor: IIdCompressor,
): ICodecFamily<DetachedFieldSummaryData> {
	return makeCodecFamily([
		[
			DetachedFieldIndexFormatVersion.v1,
			makeDetachedNodeToFieldCodecV1(revisionTagCodec, options, idCompressor),
		],
		[
			DetachedFieldIndexFormatVersion.v2,
			makeDetachedNodeToFieldCodecV2(revisionTagCodec, options, idCompressor),
		],
	]);
}

export function getCodecTreeForDetachedFieldIndexFormat(
	clientVersion: MinimumVersionForCollab,
): CodecTree {
	return {
		name: "DetachedFieldIndex",
		version: clientVersionToDetachedFieldVersion(clientVersion),
	};
}
