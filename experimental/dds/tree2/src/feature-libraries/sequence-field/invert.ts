/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { assert } from "@fluidframework/common-utils";
import { RevisionTag, TaggedChange } from "../../core";
import { fail } from "../../util";
import { CrossFieldManager, CrossFieldTarget, IdAllocator, NodeReviver } from "../modular-schema";
import { Changeset, Mark, MarkList, ReturnFrom } from "./format";
import { MarkListFactory } from "./markListFactory";
import { getInputLength, isConflicted, isObjMark, isSkipMark } from "./utils";

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
	if (isSkipMark(mark)) {
		return [mark];
	} else {
		switch (mark.type) {
			case "Insert": {
				return [
					{
						type: "Delete",
						count: mark.content.length,
					},
				];
			}
			case "Delete": {
				assert(revision !== undefined, 0x5a1 /* Unable to revert to undefined revision */);
				return [
					{
						type: "Revive",
						detachedBy: mark.revision ?? revision,
						detachIndex: inputIndex,
						content: reviver(revision, inputIndex, mark.count),
						count: mark.count,
					},
				];
			}
			case "Revive": {
				if (!isConflicted(mark)) {
					return [
						{
							type: "Delete",
							count: mark.count,
						},
					];
				}
				if (mark.lastDetachedBy === undefined) {
					// The nodes were already revived, so the revive mark did not affect them.
					return [invertModifyOrSkip(mark.count, mark.changes, inputIndex, invertChild)];
				}
				// The nodes were not revived and could not be revived.
				return [];
			}
			case "Modify": {
				return [
					{
						type: "Modify",
						changes: invertChild(mark.changes, inputIndex),
					},
				];
			}
			case "MoveOut":
			case "ReturnFrom": {
				if (isConflicted(mark)) {
					assert(
						mark.changes === undefined,
						0x4e1 /* Nested changes should have been moved to the destination of the move/return that detached them */,
					);
					// The nodes were already detached so the mark had no effect
					return [];
				}
				if (mark.isDstConflicted) {
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
						detachedBy: mark.revision ?? revision,
						detachIndex: inputIndex,
					},
				];
			}
			case "MoveIn":
			case "ReturnTo": {
				if (!isConflicted(mark)) {
					if (mark.isSrcConflicted) {
						// The nodes could have been attached but were not because of the source.
						return [];
					}
					const invertedMark: ReturnFrom<TNodeChange> = {
						type: "ReturnFrom",
						id: mark.id,
						count: mark.count,
						detachedBy: mark.revision ?? revision,
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
				if (mark.type === "ReturnTo" && mark.lastDetachedBy === undefined) {
					// The nodes were already attached, so the mark did not affect them.
					return [mark.count];
				}
				// The nodes were not attached and could not be attached.
				return [];
			}
			default:
				fail("Not implemented");
		}
	}
}

function transferMovedChanges<TNodeChange>(
	marks: MarkList<TNodeChange>,
	revision: RevisionTag | undefined,
	crossFieldManager: CrossFieldManager<TNodeChange>,
): void {
	for (const mark of marks) {
		if (isObjMark(mark) && (mark.type === "MoveOut" || mark.type === "ReturnFrom")) {
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
): Mark<TNodeChange> {
	if (changes !== undefined) {
		assert(length === 1, 0x66c /* A modify mark must have length equal to one */);
		return { type: "Modify", changes: inverter(changes, index) };
	}

	return length;
}
