/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { FieldChangeRebaser } from "../modular-schema";
import { amendCompose, compose } from "./compose";
import { Changeset } from "./types";
import { invert } from "./invert";
import { rebase } from "./rebase";
import { prune } from "./prune";

export type SequenceChangeRebaser = FieldChangeRebaser<Changeset>;

export const sequenceFieldChangeRebaser = {
	compose,
	amendCompose,
	invert,
	rebase,
	prune,
};
