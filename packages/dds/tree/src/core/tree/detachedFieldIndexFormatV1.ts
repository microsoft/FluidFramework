/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import type { Static } from "@sinclair/typebox";

import { DetachedFieldIndexFormatVersion, Format } from "./detachedFieldIndexFormatCommon.js";
import { RevisionTagSchema } from "../rebase/index.js";
import { brand } from "../../util/index.js";

export const FormatV1 = Format(
	brand<DetachedFieldIndexFormatVersion>(DetachedFieldIndexFormatVersion.v1),
	RevisionTagSchema,
);

export type FormatV1 = Static<typeof FormatV1>;
