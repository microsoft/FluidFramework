/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import type { IIdCompressor } from "@fluidframework/id-compressor";
import { lowestMinVersionForCollab } from "@fluidframework/runtime-utils/internal";

import {
	ClientVersionDispatchingCodecBuilder,
	type CodecWriteOptions,
	FluidClientVersion,
} from "../../codec/index.js";
import type { RevisionTagCodec } from "../rebase/index.js";

import { makeDetachedNodeToFieldCodecV1 } from "./detachedFieldIndexCodecV1.js";
import { makeDetachedNodeToFieldCodecV2 } from "./detachedFieldIndexCodecV2.js";
import { DetachedFieldIndexFormatVersion } from "./detachedFieldIndexFormatCommon.js";

type BuildData = CodecWriteOptions & {
	revisionTagCodec: RevisionTagCodec;
	idCompressor: IIdCompressor;
};

export const detachedFieldIndexCodecBuilder = ClientVersionDispatchingCodecBuilder.build(
	"DetachedFieldIndex",
	{
		[lowestMinVersionForCollab]: {
			formatVersion: DetachedFieldIndexFormatVersion.v1,
			codec: (buildData: BuildData) =>
				makeDetachedNodeToFieldCodecV1(buildData.revisionTagCodec, buildData.idCompressor),
		},
		[FluidClientVersion.v2_52]: {
			formatVersion: DetachedFieldIndexFormatVersion.v2,
			codec: (buildData: BuildData) =>
				makeDetachedNodeToFieldCodecV2(buildData.revisionTagCodec, buildData.idCompressor),
		},
	},
);
