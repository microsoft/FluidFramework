/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

export {
	Changeset,
	Remove,
	Detach,
	HasMoveId,
	HasRevisionTag,
	Insert,
	Mark,
	MarkList,
	MoveIn,
	MoveOut,
	NodeChangeType,
	CellCount as NodeCount,
	MoveId,
	Attach,
	NoopMark,
	LineageEvent,
	CellId,
	HasMarkFields,
	HasLineage,
	IdRange,
	CellMark,
	AttachAndDetach,
	DetachIdOverride,
} from "./types.js";
export { DetachIdOverrideType } from "./format.js";
export {
	SequenceFieldChangeHandler,
	sequenceFieldChangeHandler,
} from "./sequenceFieldChangeHandler.js";
export { SequenceChangeRebaser, sequenceFieldChangeRebaser } from "./sequenceFieldChangeRebaser.js";
export { sequenceFieldChangeCodecFactory } from "./sequenceFieldCodecs.js";
export { sequenceFieldToDelta, ToDelta } from "./sequenceFieldToDelta.js";
export { SequenceFieldEditor, sequenceFieldEditor } from "./sequenceFieldEditor.js";
export { MarkListFactory } from "./markListFactory.js";
export { NodeChangeRebaser, rebase } from "./rebase.js";
export { invert, NodeChangeInverter } from "./invert.js";
export { compose, NodeChangeComposer } from "./compose.js";
export {
	getInputLength,
	isDetach,
	newCrossFieldTable,
	CrossFieldTable,
	cloneMark,
	extractMarkEffect,
} from "./utils.js";
export { isMoveMark, MoveMark, MoveEffectTable, MoveEffect } from "./moveEffectTable.js";

export { relevantRemovedRoots } from "./relevantRemovedRoots.js";
