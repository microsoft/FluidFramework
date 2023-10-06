/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { assert, unreachableCase } from "@fluidframework/core-utils";
import { ChangeAtomId, RevisionTag, TaggedChange } from "../../core";
import { IdAllocator, fail } from "../../util";
import { CrossFieldManager, CrossFieldTarget, NodeReviver } from "../modular-schema";
import {
	Changeset,
	Mark,
	MarkList,
	ReturnFrom,
	NoopMarkType,
	MoveOut,
	NoopMark,
	Delete,
	CellMark,
	Revive,
} from "./format";
import { MarkListFactory } from "./markListFactory";
import {
	areInputCellsEmpty,
	getDetachCellId,
	getInputLength,
	getOutputCellId,
	isConflictedReattach,
	isReattachConflicted,
	splitMark,
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
	return amendMarkList(
		invertedChange,
		originalRevision,
		crossFieldManager as CrossFieldManager<TNodeChange>,
	);
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
	const type = mark.type;
	switch (type) {
		case NoopMarkType: {
			const inverse = { ...mark };
			if (mark.changes !== undefined) {
				if (mark.cellId === undefined) {
					inverse.changes = invertChild(mark.changes, inputIndex);
				} else {
					// TODO: preserve modifications to the removed nodes.
					delete inverse.changes;
				}
			}
			return [inverse];
		}
		case "Insert": {
			assert(mark.cellId !== undefined, 0x72c /* Insert marks must have a cellId */);
			const inverse = withNodeChange(
				{
					type: "Delete",
					count: mark.content.length,
					id: mark.cellId.localId,
				},
				invertNodeChange(mark.changes, inputIndex, invertChild),
			);
			return [inverse];
		}
		case "Delete": {
			assert(revision !== undefined, 0x5a1 /* Unable to revert to undefined revision */);
			const markRevision = mark.revision ?? revision;
			const inverseRevision = mark.detachIdOverride?.revision ?? markRevision;
			if (mark.cellId === undefined) {
				const inverse = withNodeChange(
					{
						type: "Revive",
						cellId: mark.detachIdOverride ?? {
							revision: markRevision,
							localId: mark.id,
						},
						content: reviver(inverseRevision, inputIndex, mark.count),
						count: mark.count,
						inverseOf: inverseRevision,
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
				assert(
					mark.cellId !== undefined,
					0x707 /* Active reattach should have a detach event */,
				);

				const deleteMark: CellMark<Delete, TNodeChange> = {
					type: "Delete",
					count: mark.count,
					id: mark.cellId.localId,
					detachIdOverride: mark.cellId,
				};

				const inverse = withNodeChange(
					deleteMark,
					invertNodeChange(mark.changes, inputIndex, invertChild),
				);
				return [inverse];
			}
			return [
				invertNodeChangeOrSkip(
					mark.count,
					mark.changes,
					inputIndex,
					invertChild,
					mark.cellId,
				),
			];
		}
		case "MoveOut":
		case "ReturnFrom": {
			if (areInputCellsEmpty(mark)) {
				// TODO: preserve modifications to the removed nodes.
				return [];
			}
			if (mark.type === "ReturnFrom" && mark.isDstConflicted) {
				// The nodes were present but the destination was conflicted, the mark had no effect on the nodes.
				return [invertNodeChangeOrSkip(mark.count, mark.changes, inputIndex, invertChild)];
			}
			if (mark.changes !== undefined) {
				assert(
					mark.count === 1,
					0x6ed /* Mark with changes can only target a single cell */,
				);
				crossFieldManager.set(
					CrossFieldTarget.Destination,
					mark.revision ?? revision,
					mark.id,
					mark.count,
					invertChild(mark.changes, inputIndex),
					true,
				);
			}

			const cellId = getDetachCellId(
				mark,
				mark.revision ?? revision ?? fail("Revision must be defined"),
				undefined,
			) ?? {
				revision: mark.revision ?? revision ?? fail("Revision must be defined"),
				localId: mark.id,
			};
			return [
				{
					type: "ReturnTo",
					id: mark.id,
					count: mark.count,
					cellId,
				},
			];
		}
		case "MoveIn":
		case "ReturnTo": {
			if (mark.isSrcConflicted) {
				return mark.type === "ReturnTo" && mark.cellId === undefined
					? [{ count: mark.count }]
					: [];
			}
			if (mark.type === "ReturnTo") {
				if (mark.cellId === undefined) {
					// The nodes were already attached, so the mark did not affect them.
					return [{ count: mark.count }];
				} else if (isConflictedReattach(mark)) {
					// The nodes were not attached and could not be attached.
					return [];
				}
			}

			const invertedMark: CellMark<ReturnFrom, TNodeChange> = {
				type: "ReturnFrom",
				id: mark.id,
				count: mark.count,
			};

			if (mark.type === "ReturnTo" && mark.cellId !== undefined) {
				invertedMark.detachIdOverride = mark.cellId;
			}

			return applyMovedChanges(invertedMark, revision, crossFieldManager);
		}
		case "Transient": {
			if (mark.cellId === undefined) {
				return [];
			}

			assert(
				mark.detach.type === "Delete" &&
					(mark.attach.type === "Insert" || mark.attach.type === "Revive"),
				"TODO: Handle transient moves",
			);

			const outputId =
				getOutputCellId(mark, revision, undefined) ??
				fail("Output cell ID should be defined");
			const markRevision = outputId.revision ?? fail("Expected revision");
			const attach: Revive = {
				type: "Revive",
				content: reviver(markRevision, inputIndex, mark.count),
				inverseOf: markRevision,
			};

			const detach: Delete = {
				type: "Delete",
				id: mark.cellId.localId,
				detachIdOverride: { ...mark.cellId, revision: mark.cellId.revision ?? revision },
			};

			return [
				withNodeChange(
					{
						type: "Transient",
						count: mark.count,
						cellId: getOutputCellId(mark, revision, undefined),
						attach,
						detach,
					},
					invertNodeChange(mark.changes, inputIndex, invertChild),
				),
			];
		}
		case "Placeholder":
			fail("Should not invert placeholder marks");
		default:
			unreachableCase(type);
	}
}

function amendMarkList<TNodeChange>(
	marks: MarkList<TNodeChange>,
	revision: RevisionTag | undefined,
	crossFieldManager: CrossFieldManager<TNodeChange>,
): MarkList<TNodeChange> {
	const factory = new MarkListFactory<TNodeChange>();

	for (const mark of marks) {
		if (mark.type === "MoveOut" || mark.type === "ReturnFrom") {
			factory.push(...applyMovedChanges(mark, revision, crossFieldManager));
		} else {
			factory.push(mark);
		}
	}

	return factory.list;
}

function applyMovedChanges<TNodeChange>(
	mark: CellMark<MoveOut | ReturnFrom, TNodeChange>,
	revision: RevisionTag | undefined,
	manager: CrossFieldManager<TNodeChange>,
): Mark<TNodeChange>[] {
	// Although this is a source mark, we query the destination because this was a destination mark during the original invert pass.
	const entry = manager.get(
		CrossFieldTarget.Destination,
		mark.revision ?? revision,
		mark.id,
		mark.count,
		true,
	);

	if (entry.length < mark.count) {
		const [mark1, mark2] = splitMark(mark, entry.length);
		const mark1WithChanges =
			entry.value !== undefined ? withNodeChange(mark1, entry.value) : mark1;

		return [mark1WithChanges, ...applyMovedChanges(mark2, revision, manager)];
	}

	if (entry.value !== undefined) {
		return [withNodeChange(mark, entry.value)];
	}

	return [mark];
}

function invertNodeChangeOrSkip<TNodeChange>(
	length: number,
	changes: TNodeChange | undefined,
	index: number,
	inverter: NodeChangeInverter<TNodeChange>,
	detachEvent?: ChangeAtomId,
): Mark<TNodeChange> {
	if (changes !== undefined) {
		assert(length === 1, 0x66c /* A modify mark must have length equal to one */);
		const noop: CellMark<NoopMark, TNodeChange> = {
			count: 1,
			changes: inverter(changes, index),
		};
		if (detachEvent !== undefined) {
			noop.cellId = detachEvent;
		}
		return noop;
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
