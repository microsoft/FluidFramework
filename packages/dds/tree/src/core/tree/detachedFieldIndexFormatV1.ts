/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { type Static } from "@sinclair/typebox";

import { Format } from "./detachedFieldIndexFormatCommon.js";
import { RevisionTagSchema } from "../rebase/index.js";

export const version1 = 1.0;

export const FormatV1 = Format(version1, RevisionTagSchema);

export type FormatV1 = Static<typeof FormatV1>;
