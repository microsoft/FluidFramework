/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import type { Static } from "@sinclair/typebox";

import { DetachedFieldIndexVersion, Format } from "./detachedFieldIndexFormatCommon.js";
import { RevisionTagSchema } from "../rebase/index.js";

export const FormatV1 = Format(DetachedFieldIndexVersion.v1, RevisionTagSchema);

export type FormatV1 = Static<typeof FormatV1>;
