/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { FieldChangeRebaser } from "../modular-schema";
import { compose } from "./compose";
import { Changeset } from "./format";
import { invert } from "./invert";
import { rebase } from "./rebase";

export type SequenceChangeRebaser = FieldChangeRebaser<Changeset>;

export const sequenceFieldChangeRebaser: SequenceChangeRebaser = {
    compose,
    invert,
    rebase,
};
