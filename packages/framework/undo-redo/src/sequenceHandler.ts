/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import {
	appendToMergeTreeDeltaRevertibles,
	discardMergeTreeDeltaRevertible,
	ISegment,
	MergeTreeDeltaRevertible,
	revertMergeTreeDeltaRevertibles,
} from "@fluidframework/merge-tree";
import { SequenceDeltaEvent, SharedSegmentSequence } from "@fluidframework/sequence";
import { IRevertible, UndoRedoStackManager } from "./undoRedoStackManager.js";

/**
 * A shared segment sequence undo redo handler that will add all local sequences changes to the provided
 * undo redo stack manager
 * @internal
 */
export class SharedSegmentSequenceUndoRedoHandler {
	private readonly sequences = new Map<
		SharedSegmentSequence<ISegment>,
		SharedSegmentSequenceRevertible | undefined
	>();

	constructor(private readonly stackManager: UndoRedoStackManager) {
		this.stackManager.on("changePushed", () => this.sequences.clear());
	}

	public attachSequence<T extends ISegment>(sequence: SharedSegmentSequence<T>) {
		sequence.on("sequenceDelta", this.sequenceDeltaHandler);
	}

	public detachSequence<T extends ISegment>(sequence: SharedSegmentSequence<T>) {
		sequence.removeListener("sequenceDelta", this.sequenceDeltaHandler);
	}

	private readonly sequenceDeltaHandler = (
		event: SequenceDeltaEvent,
		target: SharedSegmentSequence<ISegment>,
	) => {
		if (event.isLocal) {
			let revertible = this.sequences.get(target);
			if (revertible === undefined) {
				revertible = new SharedSegmentSequenceRevertible(target);
				this.stackManager.pushToCurrentOperation(revertible);
				this.sequences.set(target, revertible);
			}
			revertible.add(event);
		}
	};
}

/**
 * Tracks a change on a shared segment sequence and allows reverting it
 * @internal
 */
export class SharedSegmentSequenceRevertible implements IRevertible {
	private readonly revertibles: MergeTreeDeltaRevertible[];

	constructor(public readonly sequence: SharedSegmentSequence<ISegment>) {
		this.revertibles = [];
	}

	public add(event: SequenceDeltaEvent) {
		appendToMergeTreeDeltaRevertibles(event.deltaArgs, this.revertibles);
	}

	public revert() {
		revertMergeTreeDeltaRevertibles(this.sequence, this.revertibles);
	}

	public discard() {
		discardMergeTreeDeltaRevertible(this.revertibles);
	}
}
