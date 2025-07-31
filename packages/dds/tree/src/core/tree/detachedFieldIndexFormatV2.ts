/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { Type, type Static } from "@sinclair/typebox";

import { Format } from "./detachedFieldIndexFormatCommon.js";
import { RevisionTagSchema, StableIdSchema } from "../rebase/index.js";

export const version2 = 2.0;

export const StableOrFinalRevisionTag = Type.Union([RevisionTagSchema, StableIdSchema]);

export const FormatV2 = Format(version2, StableOrFinalRevisionTag);

export type FormatV2 = Static<typeof FormatV2>;
