/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import type { FieldChangeHandler } from "../modular-schema/index.js";

import { relevantRemovedRoots } from "./relevantRemovedRoots.js";
import { sequenceFieldChangeRebaser } from "./sequenceFieldChangeRebaser.js";
import { sequenceFieldChangeCodecFactory } from "./sequenceFieldCodecs.js";
import { type SequenceFieldEditor, sequenceFieldEditor } from "./sequenceFieldEditor.js";
import { sequenceFieldToDelta } from "./sequenceFieldToDelta.js";
import type { Changeset } from "./types.js";
import { createEmpty, getNestedChanges, isEmpty } from "./utils.js";

export type SequenceFieldChangeHandler = FieldChangeHandler<Changeset, SequenceFieldEditor>;

export const sequenceFieldChangeHandler: SequenceFieldChangeHandler = {
	rebaser: sequenceFieldChangeRebaser,
	codecsFactory: sequenceFieldChangeCodecFactory,
	editor: sequenceFieldEditor,
	intoDelta: sequenceFieldToDelta,
	relevantRemovedRoots,
	isEmpty,
	getNestedChanges,
	createEmpty,
};
