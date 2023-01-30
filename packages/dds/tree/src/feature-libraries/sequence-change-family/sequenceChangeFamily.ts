/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { ChangeFamily, AnchorSet } from "../../core";
import { toDelta } from "./changeset";
import { sequenceChangeRebaser } from "./sequenceChangeRebaser";
import { sequenceChangeEncoder, SequenceChangeset } from "./sequenceChangeset";
import { SequenceEditBuilder } from "./sequenceEditBuilder";

function buildEditor(
	changeReceiver: (change: SequenceChangeset) => void,
	anchorSet: AnchorSet,
): SequenceEditBuilder {
	return new SequenceEditBuilder(changeReceiver, anchorSet);
}

export type SequenceChangeFamily = ChangeFamily<SequenceEditBuilder, SequenceChangeset>;

export const sequenceChangeFamily: SequenceChangeFamily = {
	rebaser: sequenceChangeRebaser,
	buildEditor,
	intoDelta: toDelta,
	encoder: sequenceChangeEncoder,
};
