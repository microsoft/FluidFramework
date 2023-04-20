/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { FieldChangeHandler } from "../modular-schema";
import { Changeset, isEmpty } from "./format";
import { sequenceFieldChangeRebaser } from "./sequenceFieldChangeRebaser";
import { sequenceFieldChangeCodecFactory } from "./sequenceFieldChangeEncoder";
import { SequenceFieldEditor, sequenceFieldEditor } from "./sequenceFieldEditor";
import { sequenceFieldToDelta } from "./sequenceFieldToDelta";

export type SequenceFieldChangeHandler = FieldChangeHandler<Changeset, SequenceFieldEditor>;

export const sequenceFieldChangeHandler: SequenceFieldChangeHandler = {
	rebaser: sequenceFieldChangeRebaser,
	codecsFactory: sequenceFieldChangeCodecFactory,
	editor: sequenceFieldEditor,
	intoDelta: sequenceFieldToDelta,
	isEmpty,
};
