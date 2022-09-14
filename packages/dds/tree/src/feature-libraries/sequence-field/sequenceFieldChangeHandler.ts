/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { FieldChangeHandler } from "../modular-schema";
import { SequenceChange } from "./format";
import { sequenceFieldChangeRebaser } from "./sequenceFieldChangeRebaser";
import { sequenceFieldChangeEncoder } from "./sequenceFieldChangeEncoder";
import { sequenceFieldEditor } from "./sequenceEditBuilder";
import { sequenceFieldToDelta } from "./sequenceFieldToDelta";

export type SequenceFieldChangeHandler = FieldChangeHandler<SequenceChange>;

export const sequenceFieldChangeHandler: SequenceFieldChangeHandler = {
    rebaser: sequenceFieldChangeRebaser,
    encoder: sequenceFieldChangeEncoder,
    editor: sequenceFieldEditor,
    intoDelta: sequenceFieldToDelta,
};
