/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { FieldChangeRebaser } from "../modular-schema/index.js";
import { compose } from "./compose.js";
import { Changeset } from "./types.js";
import { invert } from "./invert.js";
import { rebase } from "./rebase.js";
import { prune } from "./prune.js";

export type SequenceChangeRebaser = FieldChangeRebaser<Changeset>;

export const sequenceFieldChangeRebaser = {
	compose,
	invert,
	rebase,
	prune,
};
