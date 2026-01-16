/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import type { Static } from "@sinclair/typebox";

import { brand } from "../../util/index.js";
import { FormatCommon, ForestFormatVersion } from "./formatCommon.js";

export const FormatV2 = FormatCommon(brand<ForestFormatVersion>(ForestFormatVersion.v2));
export type FormatV2 = Static<typeof FormatV2>;
