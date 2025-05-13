/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import {
	ISegment,
	MergeTreeDeltaRevertible,
	appendToMergeTreeDeltaRevertibles,
	discardMergeTreeDeltaRevertible,
	revertMergeTreeDeltaRevertibles,
} from "@fluidframework/merge-tree/internal";
import {
	SequenceDeltaEvent,
	type ISharedSegmentSequence,
} from "@fluidframework/sequence/internal";

import { IRevertible, UndoRedoStackManager } from "./undoRedoStackManager.js";

/**
 * A shared segment sequence undo redo handler that will add all local sequences changes to the provided
 * undo redo stack manager
 * @internal
 */
export class SharedSegmentSequenceUndoRedoHandler {
	private readonly sequences = new Map<
		ISharedSegmentSequence<ISegment>,
		SharedSegmentSequenceRevertible | undefined
	>();

	constructor(private readonly stackManager: UndoRedoStackManager) {
		this.stackManager.on("changePushed", () => this.sequences.clear());
	}

	public attachSequence<T extends ISegment>(sequence: ISharedSegmentSequence<T>): void {
		sequence.on("sequenceDelta", this.sequenceDeltaHandler);
	}

	public detachSequence<T extends ISegment>(sequence: ISharedSegmentSequence<T>): void {
		sequence.off("sequenceDelta", this.sequenceDeltaHandler);
	}

	private readonly sequenceDeltaHandler = (
		event: SequenceDeltaEvent,
		target: ISharedSegmentSequence<ISegment>,
	): void => {
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

	constructor(public readonly sequence: ISharedSegmentSequence<ISegment>) {
		this.revertibles = [];
	}

	public add(event: SequenceDeltaEvent): void {
		appendToMergeTreeDeltaRevertibles(event.deltaArgs, this.revertibles);
	}

	public revert(): void {
		revertMergeTreeDeltaRevertibles(this.sequence, this.revertibles);
	}

	public discard(): void {
		discardMergeTreeDeltaRevertible(this.revertibles);
	}
}
