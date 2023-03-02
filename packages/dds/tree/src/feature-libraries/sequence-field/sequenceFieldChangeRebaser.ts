/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { FieldChangeRebaser } from "../modular-schema";
import { amendCompose, compose } from "./compose";
import { Changeset } from "./format";
import { amendInvert, invert } from "./invert";
import { amendRebase, rebase } from "./rebase";

export type SequenceChangeRebaser = FieldChangeRebaser<Changeset>;

export const sequenceFieldChangeRebaser = {
	compose,
	amendCompose,
	invert,
	amendInvert,
	rebase,
	amendRebase,
};
