/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import type { FieldChangeRebaser } from "../modular-schema/index.js";

import { compose } from "./compose.js";
import { invert } from "./invert.js";
import { prune } from "./prune.js";
import { rebase } from "./rebase.js";
import { replaceRevisions } from "./replaceRevisions.js";
import type { Changeset } from "./types.js";
import { omitMarkEffect } from "./utils.js";

export type SequenceChangeRebaser = FieldChangeRebaser<Changeset>;

export const sequenceFieldChangeRebaser = {
	compose,
	invert,
	rebase,
	prune,
	replaceRevisions,
	mute: (change: Changeset): Changeset => {
		return change.map((mark) => omitMarkEffect(mark));
	},
};
