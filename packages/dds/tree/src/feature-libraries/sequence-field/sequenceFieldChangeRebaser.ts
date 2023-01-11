/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { fail } from "../../util";
import { FieldChangeRebaser } from "../modular-schema";
import { compose } from "./compose";
import { Changeset } from "./format";
import { amendInvert, invert } from "./invert";
import { rebase } from "./rebase";

export type SequenceChangeRebaser = FieldChangeRebaser<Changeset>;

export const sequenceFieldChangeRebaser = {
    compose,
    invert,
    rebase,
    amendCompose: () => fail("Not implemented"),
    amendInvert,
    amendRebase: () => fail("Not implemented"),
};
