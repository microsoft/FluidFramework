/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import type { Static } from "@sinclair/typebox";

import { ForestFormatVersion, FormatCommon } from "./formatCommon.js";

export const FormatV2 = FormatCommon(ForestFormatVersion.v2);
export type FormatV2 = Static<typeof FormatV2>;
