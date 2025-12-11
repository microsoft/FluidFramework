/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import type { IIdCompressor } from "@fluidframework/id-compressor";
import type { MinimumVersionForCollab } from "@fluidframework/runtime-definitions/internal";
import { lowestMinVersionForCollab } from "@fluidframework/runtime-utils/internal";

import {
	ClientVersionDispatchingCodecBuilder,
	type CodecTree,
	type CodecWriteOptions,
	FluidClientVersion,
	type IJsonCodec,
} from "../../codec/index.js";
import type { RevisionTagCodec } from "../rebase/index.js";

import { makeDetachedNodeToFieldCodecV1 } from "./detachedFieldIndexCodecV1.js";
import { makeDetachedNodeToFieldCodecV2 } from "./detachedFieldIndexCodecV2.js";
import type { DetachedFieldSummaryData } from "./detachedFieldIndexTypes.js";
import { DetachedFieldIndexFormatVersion } from "./detachedFieldIndexFormatCommon.js";

export function makeDetachedFieldIndexCodec(
	revisionTagCodec: RevisionTagCodec,
	options: CodecWriteOptions,
	idCompressor: IIdCompressor,
): IJsonCodec<DetachedFieldSummaryData> {
	return builder.build({ ...options, revisionTagCodec, idCompressor });
}

type BuildData = CodecWriteOptions & {
	revisionTagCodec: RevisionTagCodec;
	idCompressor: IIdCompressor;
};

// Exported for testing purposes.
export const builder = ClientVersionDispatchingCodecBuilder.build("DetachedFieldIndex", {
	[lowestMinVersionForCollab]: {
		formatVersion: DetachedFieldIndexFormatVersion.v1 as DetachedFieldIndexFormatVersion,
		codec: (buildData: BuildData) =>
			makeDetachedNodeToFieldCodecV1(
				buildData.revisionTagCodec,
				buildData,
				buildData.idCompressor,
			),
	},
	[FluidClientVersion.v2_43]: {
		formatVersion: DetachedFieldIndexFormatVersion.v2 as DetachedFieldIndexFormatVersion,
		codec: (buildData: BuildData) =>
			makeDetachedNodeToFieldCodecV2(
				buildData.revisionTagCodec,
				buildData,
				buildData.idCompressor,
			),
	},
});

export function getCodecTreeForDetachedFieldIndexFormat(
	clientVersion: MinimumVersionForCollab,
): CodecTree {
	return builder.getCodecTree(clientVersion);
}
