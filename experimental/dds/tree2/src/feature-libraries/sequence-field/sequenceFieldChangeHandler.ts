/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { FieldChangeHandler } from "../modular-schema";
import { Changeset } from "./types";
import { sequenceFieldChangeRebaser } from "./sequenceFieldChangeRebaser";
import { sequenceFieldChangeCodecFactory } from "./sequenceFieldCodecs";
import { SequenceFieldEditor, sequenceFieldEditor } from "./sequenceFieldEditor";
import { sequenceFieldToDelta } from "./sequenceFieldToDelta";
import { isEmpty } from "./utils";
import { relevantDetachedTrees } from "./relevantDetachedTrees";

export type SequenceFieldChangeHandler = FieldChangeHandler<Changeset, SequenceFieldEditor>;

export const sequenceFieldChangeHandler: SequenceFieldChangeHandler = {
	rebaser: sequenceFieldChangeRebaser,
	codecsFactory: sequenceFieldChangeCodecFactory,
	editor: sequenceFieldEditor,
	intoDelta: sequenceFieldToDelta,
	relevantDetachedTrees,
	isEmpty,
};
