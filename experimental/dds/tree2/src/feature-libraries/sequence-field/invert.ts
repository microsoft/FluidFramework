/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { assert } from "@fluidframework/common-utils";
import { RevisionTag, TaggedChange } from "../../core";
import { fail } from "../../util";
import { CrossFieldManager, CrossFieldTarget, IdAllocator, NodeReviver } from "../modular-schema";
import { Changeset, DetachEvent, Mark, MarkList, Modify, ReturnFrom, NoopMarkType } from "./format";
import { MarkListFactory } from "./markListFactory";
import {
	areInputCellsEmpty,
	getInputLength,
	isConflictedReattach,
	isReattachConflicted,
	withNodeChange,
} from "./utils";

export type NodeChangeInverter<TNodeChange> = (
	change: TNodeChange,
	index: number | undefined,
) => TNodeChange;

/**
 * Inverts a given changeset.
 * @param change - The changeset to produce the inverse of.
 * @returns The inverse of the given `change` such that the inverse can be applied after `change`.
 *
 * WARNING! This implementation is incomplete:
 * - Support for slices is not implemented.
 */
export function invert<TNodeChange>(
	change: TaggedChange<Changeset<TNodeChange>>,
	invertChild: NodeChangeInverter<TNodeChange>,
	reviver: NodeReviver,
	genId: IdAllocator,
	crossFieldManager: CrossFieldManager,
): Changeset<TNodeChange> {
	return invertMarkList(
		change.change,
		change.revision,
		reviver,
		invertChild,
		crossFieldManager as CrossFieldManager<TNodeChange>,
	);
}

export function amendInvert<TNodeChange>(
	invertedChange: Changeset<TNodeChange>,
	originalRevision: RevisionTag | undefined,
	reviver: NodeReviver,
	genId: IdAllocator,
	crossFieldManager: CrossFieldManager,
): Changeset<TNodeChange> {
	transferMovedChanges(
		invertedChange,
		originalRevision,
		crossFieldManager as CrossFieldManager<TNodeChange>,
	);
	return invertedChange;
}

function invertMarkList<TNodeChange>(
	markList: MarkList<TNodeChange>,
	revision: RevisionTag | undefined,
	reviver: NodeReviver,
	invertChild: NodeChangeInverter<TNodeChange>,
	crossFieldManager: CrossFieldManager<TNodeChange>,
): MarkList<TNodeChange> {
	const inverseMarkList = new MarkListFactory<TNodeChange>();
	let inputIndex = 0;

	for (const mark of markList) {
		const inverseMarks = invertMark(
			mark,
			inputIndex,
			revision,
			reviver,
			invertChild,
			crossFieldManager,
		);
		inverseMarkList.push(...inverseMarks);
		inputIndex += getInputLength(mark);
	}

	return inverseMarkList.list;
}

function invertMark<TNodeChange>(
	mark: Mark<TNodeChange>,
	inputIndex: number,
	revision: RevisionTag | undefined,
	reviver: NodeReviver,
	invertChild: NodeChangeInverter<TNodeChange>,
	crossFieldManager: CrossFieldManager<TNodeChange>,
): Mark<TNodeChange>[] {
	switch (mark.type) {
		case NoopMarkType: {
			return [mark];
		}
		case "Insert": {
			const inverse = withNodeChange(
				{ type: "Delete", count: mark.content.length },
				invertNodeChange(mark.changes, inputIndex, invertChild),
			);
			return [inverse];
		}
		case "Delete": {
			assert(revision !== undefined, 0x5a1 /* Unable to revert to undefined revision */);
			if (mark.detachEvent === undefined) {
				const inverse = withNodeChange(
					{
						type: "Revive",
						detachEvent: { revision: mark.revision ?? revision, index: inputIndex },
						content: reviver(revision, inputIndex, mark.count),
						count: mark.count,
						inverseOf: mark.revision ?? revision,
					},
					invertNodeChange(mark.changes, inputIndex, invertChild),
				);

				return [inverse];
			}
			// TODO: preserve modifications to the removed nodes.
			return [];
		}
		case "Revive": {
			if (!isReattachConflicted(mark)) {
				const inverse = withNodeChange(
					{
						type: "Delete",
						count: mark.count,
					},
					invertNodeChange(mark.changes, inputIndex, invertChild),
				);
				return [inverse];
			}
			return [
				invertModifyOrSkip(
					mark.count,
					mark.changes,
					inputIndex,
					invertChild,
					mark.detachEvent,
				),
			];
		}
		case "Modify": {
			if (mark.detachEvent === undefined) {
				return [
					{
						type: "Modify",
						changes: invertChild(mark.changes, inputIndex),
					},
				];
			}
			// TODO: preserve modifications to the removed nodes.
			return [];
		}
		case "MoveOut":
		case "ReturnFrom": {
			if (areInputCellsEmpty(mark)) {
				// TODO: preserve modifications to the removed nodes.
				return [];
			}
			if (mark.type === "ReturnFrom" && mark.isDstConflicted) {
				// The nodes were present but the destination was conflicted, the mark had no effect on the nodes.
				return [invertModifyOrSkip(mark.count, mark.changes, inputIndex, invertChild)];
			}
			if (mark.changes !== undefined) {
				crossFieldManager.getOrCreate(
					CrossFieldTarget.Destination,
					mark.revision ?? revision,
					mark.id,
					invertChild(mark.changes, inputIndex),
					true,
				);
			}
			return [
				{
					type: "ReturnTo",
					id: mark.id,
					count: mark.count,
					detachEvent: {
						revision: mark.revision ?? revision ?? fail("Revision must be defined"),
						index: inputIndex,
					},
				},
			];
		}
		case "MoveIn":
		case "ReturnTo": {
			if (mark.isSrcConflicted) {
				return mark.type === "ReturnTo" && mark.detachEvent === undefined
					? [{ count: mark.count }]
					: [];
			}
			if (mark.type === "ReturnTo") {
				if (mark.detachEvent === undefined) {
					// The nodes were already attached, so the mark did not affect them.
					return [{ count: mark.count }];
				} else if (isConflictedReattach(mark)) {
					// The nodes were not attached and could not be attached.
					return [];
				}
			}

			const invertedMark: ReturnFrom<TNodeChange> = {
				type: "ReturnFrom",
				id: mark.id,
				count: mark.count,
			};

			const movedChanges = crossFieldManager.get(
				CrossFieldTarget.Destination,
				mark.revision ?? revision,
				mark.id,
				true,
			);

			if (movedChanges !== undefined) {
				invertedMark.changes = movedChanges;
			}
			return [invertedMark];
		}
		default:
			fail("Not implemented");
	}
}

function transferMovedChanges<TNodeChange>(
	marks: MarkList<TNodeChange>,
	revision: RevisionTag | undefined,
	crossFieldManager: CrossFieldManager<TNodeChange>,
): void {
	for (const mark of marks) {
		if (mark.type === "MoveOut" || mark.type === "ReturnFrom") {
			const change = crossFieldManager.get(
				CrossFieldTarget.Destination,
				mark.revision ?? revision,
				mark.id,
				true,
			);

			if (change !== undefined) {
				mark.changes = change;
			}
		}
	}
}

function invertModifyOrSkip<TNodeChange>(
	length: number,
	changes: TNodeChange | undefined,
	index: number,
	inverter: NodeChangeInverter<TNodeChange>,
	detachEvent?: DetachEvent,
): Mark<TNodeChange> {
	if (changes !== undefined) {
		assert(length === 1, 0x66c /* A modify mark must have length equal to one */);
		const modify: Modify<TNodeChange> = { type: "Modify", changes: inverter(changes, index) };
		if (detachEvent !== undefined) {
			modify.detachEvent = detachEvent;
		}
		return modify;
	}

	return { count: detachEvent === undefined ? length : 0 };
}

function invertNodeChange<TNodeChange>(
	change: TNodeChange | undefined,
	index: number,
	inverter: NodeChangeInverter<TNodeChange>,
): TNodeChange | undefined {
	return change === undefined ? undefined : inverter(change, index);
}
