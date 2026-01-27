/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { Type, type Static } from "@sinclair/typebox";

import { brand } from "../../util/index.js";
import { RevisionTagSchema, StableIdSchema } from "../rebase/index.js";

import { DetachedFieldIndexFormatVersion, Format } from "./detachedFieldIndexFormatCommon.js";

export const StableOrFinalRevisionTag = Type.Union([RevisionTagSchema, StableIdSchema]);

export const FormatV2 = Format(
	brand<DetachedFieldIndexFormatVersion>(DetachedFieldIndexFormatVersion.v2),
	StableOrFinalRevisionTag,
);

export type FormatV2 = Static<typeof FormatV2>;
