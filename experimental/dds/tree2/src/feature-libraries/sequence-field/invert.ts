/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { assert, unreachableCase } from "@fluidframework/core-utils";
import { ChangeAtomId, RevisionTag, TaggedChange } from "../../core";
import { IdAllocator, fail } from "../../util";
import { CrossFieldManager, CrossFieldTarget } from "../modular-schema";
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
} from "./format";
import { MarkListFactory } from "./markListFactory";
import {
	areInputCellsEmpty,
	extractMarkEffect,
	getDetachCellId,
	getEndpoint,
	getInputLength,
	getOutputCellId,
	isAttach,
	isDetach,
	isMuted,
	isReattach,
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
	genId: IdAllocator,
	crossFieldManager: CrossFieldManager,
): Changeset<TNodeChange> {
	return invertMarkList(
		change.change,
		change.revision,
		invertChild,
		crossFieldManager as CrossFieldManager<TNodeChange>,
	);
}

export function amendInvert<TNodeChange>(
	invertedChange: Changeset<TNodeChange>,
	originalRevision: RevisionTag | undefined,
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
	invertChild: NodeChangeInverter<TNodeChange>,
	crossFieldManager: CrossFieldManager<TNodeChange>,
): MarkList<TNodeChange> {
	const inverseMarkList = new MarkListFactory<TNodeChange>();
	let inputIndex = 0;

	for (const mark of markList) {
		const inverseMarks = invertMark(mark, inputIndex, revision, invertChild, crossFieldManager);
		inverseMarkList.push(...inverseMarks);
		inputIndex += getInputLength(mark);
	}

	return inverseMarkList.list;
}

function invertMark<TNodeChange>(
	mark: Mark<TNodeChange>,
	inputIndex: number,
	revision: RevisionTag | undefined,
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
		case "Delete": {
			assert(revision !== undefined, 0x5a1 /* Unable to revert to undefined revision */);
			const markRevision = mark.revision ?? revision;
			if (mark.cellId === undefined) {
				const inverse = withNodeChange(
					{
						type: "Insert",
						cellId: mark.detachIdOverride ?? {
							revision: markRevision,
							localId: mark.id,
						},
						count: mark.count,
					},
					invertNodeChange(mark.changes, inputIndex, invertChild),
				);
				return [inverse];
			}
			// TODO: preserve modifications to the removed nodes.
			return [];
		}
		case "Insert": {
			if (isMuted(mark)) {
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
			assert(mark.cellId !== undefined, "Active inserts should target empty cells");
			const deleteMark: CellMark<Delete, TNodeChange> = {
				type: "Delete",
				count: mark.count,
				id: mark.cellId.localId,
			};

			if (isReattach(mark)) {
				deleteMark.detachIdOverride = mark.cellId;
			}

			const inverse = withNodeChange(
				deleteMark,
				invertNodeChange(mark.changes, inputIndex, invertChild),
			);
			return [inverse];
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

				const endpoint = getEndpoint(mark, revision);
				crossFieldManager.set(
					CrossFieldTarget.Destination,
					endpoint.revision,
					endpoint.localId,
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

			const invertedMark: Mark<TNodeChange> = {
				type: "MoveIn",
				id: mark.id,
				count: mark.count,
				cellId,
			};

			if (mark.finalEndpoint !== undefined) {
				invertedMark.finalEndpoint = { localId: mark.finalEndpoint.localId };
			}
			return [invertedMark];
		}
		case "MoveIn": {
			if (isMuted(mark)) {
				return mark.cellId === undefined ? [{ count: mark.count }] : [];
			}

			const invertedMark: CellMark<ReturnFrom, TNodeChange> = {
				type: "ReturnFrom",
				id: mark.id,
				count: mark.count,
			};

			if (mark.finalEndpoint) {
				invertedMark.finalEndpoint = { localId: mark.finalEndpoint.localId };
			}

			if (isReattach(mark)) {
				invertedMark.detachIdOverride = mark.cellId;
			}

			return applyMovedChanges(invertedMark, revision, crossFieldManager);
		}
		case "Transient": {
			// Which should get the child change? Don't want to invert twice
			const attach: Mark<TNodeChange> = {
				count: mark.count,
				cellId: mark.cellId,
				...mark.attach,
			};
			const idAfterAttach = getOutputCellId(attach, revision, undefined);

			// We put `mark.changes` on the detach so that if it is a move source
			// the changes can be sent to the endpoint.
			const detach: Mark<TNodeChange> = {
				count: mark.count,
				cellId: idAfterAttach,
				changes: mark.changes,
				...mark.detach,
			};
			const attachInverses = invertMark(
				attach,
				inputIndex,
				revision,
				invertChild,
				crossFieldManager,
			);
			const detachInverses = invertMark(
				detach,
				inputIndex,
				revision,
				invertChild,
				crossFieldManager,
			);

			if (detachInverses.length === 0) {
				return attachInverses;
			}

			assert(
				detachInverses.length === 1,
				"Only expected MoveIn marks to be split when inverting",
			);

			let detachInverse = detachInverses[0];
			assert(isAttach(detachInverse), "Inverse of a detach should be an attach");

			const inverses: Mark<TNodeChange>[] = [];
			for (const attachInverse of attachInverses) {
				let detachInverseCurr: Mark<TNodeChange> = detachInverse;
				if (attachInverse.count !== detachInverse.count) {
					[detachInverseCurr, detachInverse] = splitMark(
						detachInverse,
						attachInverse.count,
					);
				}

				if (attachInverse.type === NoopMarkType) {
					if (attachInverse.changes !== undefined) {
						assert(detachInverseCurr.changes === undefined, "Unexpected node changes");
						detachInverseCurr.changes = attachInverse.changes;
					}
					inverses.push(detachInverseCurr);
					continue;
				}
				assert(isDetach(attachInverse), "Inverse of an attach should be a detach");

				const inverted: Mark<TNodeChange> = {
					type: "Transient",
					count: attachInverse.count,
					attach: extractMarkEffect(detachInverseCurr),
					detach: extractMarkEffect(attachInverse),
				};

				if (detachInverseCurr.cellId !== undefined) {
					inverted.cellId = detachInverseCurr.cellId;
				}

				if (detachInverseCurr.changes !== undefined) {
					inverted.changes = detachInverseCurr.changes;
				}

				if (attachInverse.changes !== undefined) {
					assert(inverted.changes === undefined, "Unexpected node changes");
					inverted.changes = attachInverse.changes;
				}

				inverses.push(inverted);
			}

			return inverses;
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
