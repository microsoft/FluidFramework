/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { Multiplicity, forbiddenFieldKindIdentifier } from "../../core/index.js";
import {
	sequenceIdentifier,
	identifierFieldIdentifier,
	requiredIdentifier,
	optionalIdentifier,
} from "../fieldKindIdentifiers.js";
import { FlexFieldKind } from "../modular-schema/index.js";

import { sequenceFieldChangeHandler } from "./sequenceFieldChangeHandler.js";
import type { SequenceFieldEditor } from "./sequenceFieldEditor.js";

interface Sequence
	extends FlexFieldKind<
		SequenceFieldEditor,
		typeof sequenceIdentifier,
		Multiplicity.Sequence
	> {}

/**
 * 0 or more items.
 */
export const sequence: Sequence = new FlexFieldKind(
	sequenceIdentifier,
	Multiplicity.Sequence,
	{
		changeHandler: sequenceFieldChangeHandler,
		allowMonotonicUpgradeFrom: new Set([
			requiredIdentifier,
			optionalIdentifier,
			identifierFieldIdentifier,
			forbiddenFieldKindIdentifier,
		]),
	},
);
