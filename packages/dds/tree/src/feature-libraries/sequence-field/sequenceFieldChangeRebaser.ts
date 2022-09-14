/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { FieldChangeRebaser } from "../modular-schema";
import { compose } from "./compose";
import { SequenceChange } from "./format";
import { invert } from "./invert";
import { rebase } from "./rebase";

export type SequenceChangeRebaser = FieldChangeRebaser<SequenceChange>;

export const sequenceFieldChangeRebaser: SequenceChangeRebaser = {
    compose,
    invert,
    rebase,
};
