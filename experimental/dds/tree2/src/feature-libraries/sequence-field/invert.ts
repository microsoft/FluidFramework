/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { assert } from "@fluidframework/common-utils";
import { RevisionTag, TaggedChange } from "../../core";
import { fail } from "../../util";
import {
	ChangeAtomId,
	CrossFieldManager,
	CrossFieldTarget,
	IdAllocator,
	NodeReviver,
} from "../modular-schema";
import { Changeset, Mark, MarkList, Modify, ReturnFrom, MoveOut } from "./format";
import { MarkListFactory } from "./markListFactory";
import {
	areInputCellsEmpty,
	getEffect,
	getInputLength,
	isConflictedReattach,
	isMoveOut,
	isReattachConflicted,
	isReturnFrom,
	splitMark,
	tryGetEffect,
	withNodeChange,
} from "./utils";
import { MoveOutMark, ReturnFromMark, ReviveMark } from "./helperTypes";

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
	const effect = tryGetEffect(mark);
	if (effect === undefined) {
		return [mark];
	}
	switch (effect.type) {
		case "Insert": {
			assert(mark.cellId !== undefined, "Insert marks must target empty cells");
			if (effect.transientDetach !== undefined) {
				assert(revision !== undefined, "Unable to revert to undefined revision");
				return [
					withNodeChange(
						{
							cellId: {
								revision: effect.transientDetach.revision ?? revision,
								localId: effect.transientDetach.localId,
							},
							count: mark.count,
							effects: [
								{
									type: "Revive",
									content: reviver(revision, inputIndex, effect.content.length),
									inverseOf: effect.revision ?? revision,
									transientDetach: {
										revision: mark.cellId.revision ?? revision,
										localId: mark.cellId.localId,
									},
								},
							],
						},
						invertNodeChange(effect.changes, inputIndex, invertChild),
					),
				];
			} else {
				const inverse = withNodeChange(
					{
						count: mark.count,
						effects: [{ type: "Delete", id: mark.cellId.localId }],
					},
					invertNodeChange(effect.changes, inputIndex, invertChild),
				);
				return [inverse];
			}
		}
		case "Delete": {
			assert(revision !== undefined, 0x5a1 /* Unable to revert to undefined revision */);
			if (mark.cellId === undefined) {
				const inverse = withNodeChange(
					{
						cellId: { revision: effect.revision ?? revision, localId: effect.id },
						count: mark.count,
						effects: [
							{
								type: "Revive",
								content: reviver(revision, inputIndex, mark.count),
								inverseOf: effect.revision ?? revision,
							},
						],
					},
					invertNodeChange(effect.changes, inputIndex, invertChild),
				);

				return [inverse];
			}
			// TODO: preserve modifications to the removed nodes.
			return [];
		}
		case "Revive": {
			const reviveMark = mark as ReviveMark<TNodeChange>;
			if (!isReattachConflicted(reviveMark)) {
				assert(
					mark.cellId !== undefined,
					0x707 /* Active reattach should have a detach event */,
				);
				if (effect.transientDetach !== undefined) {
					assert(revision !== undefined, "Unable to revert to undefined revision");
					return [
						withNodeChange(
							{
								cellId: {
									revision: effect.transientDetach.revision ?? revision,
									localId: effect.transientDetach.localId,
								},
								count: mark.count,
								effects: [
									{
										type: "Revive",
										content: reviver(revision, inputIndex, mark.count),
										inverseOf: effect.revision ?? revision,
										transientDetach: {
											revision: effect.revision ?? revision,
											localId: mark.cellId.localId,
										},
									},
								],
							},
							invertNodeChange(effect.changes, inputIndex, invertChild),
						),
					];
				}
				const inverse = withNodeChange(
					{
						count: mark.count,
						effects: [
							{
								type: "Delete",
								id: mark.cellId.localId,
							},
						],
					},
					invertNodeChange(effect.changes, inputIndex, invertChild),
				);
				return [inverse];
			}
			return effect.transientDetach !== undefined
				? invertMark(
						{
							count: mark.count,
							effects: [
								{
									type: "Delete",
									revision: effect.transientDetach.revision ?? revision,
									changes: effect.changes,
									id: effect.transientDetach.localId,
								},
							],
						},
						inputIndex,
						revision,
						reviver,
						invertChild,
						crossFieldManager,
				  )
				: [
						invertModifyOrSkip(
							mark.count,
							effect.changes,
							inputIndex,
							invertChild,
							mark.cellId,
						),
				  ];
		}
		case "Modify": {
			if (mark.cellId === undefined) {
				return [withNodeChange(mark, invertChild(effect.changes, inputIndex))];
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
			if (effect.type === "ReturnFrom" && effect.isDstConflicted) {
				// The nodes were present but the destination was conflicted, the mark had no effect on the nodes.
				return [invertModifyOrSkip(mark.count, effect.changes, inputIndex, invertChild)];
			}
			if (effect.changes !== undefined) {
				assert(
					mark.count === 1,
					0x6ed /* Mark with changes can only target a single cell */,
				);
				crossFieldManager.set(
					CrossFieldTarget.Destination,
					effect.revision ?? revision,
					effect.id,
					mark.count,
					invertChild(effect.changes, inputIndex),
					true,
				);
			}
			return [
				{
					cellId: {
						revision: effect.revision ?? revision ?? fail("Revision must be defined"),
						localId: effect.id,
					},
					count: mark.count,
					effects: [
						{
							type: "ReturnTo",
							id: effect.id,
						},
					],
				},
			];
		}
		case "MoveIn":
		case "ReturnTo": {
			if (effect.isSrcConflicted) {
				return effect.type === "ReturnTo" && mark.cellId === undefined
					? [{ count: mark.count }]
					: [];
			}
			if (effect.type === "ReturnTo") {
				if (mark.cellId === undefined) {
					// The nodes were already attached, so the mark did not affect them.
					return [{ count: mark.count }];
				} else if (isConflictedReattach(mark)) {
					// The nodes were not attached and could not be attached.
					return [];
				}
			}

			const invertedMark: ReturnFromMark<TNodeChange> = {
				count: mark.count,
				effects: [
					{
						type: "ReturnFrom",
						id: effect.id,
					},
				],
			};

			return applyMovedChanges(invertedMark, revision, crossFieldManager);
		}
		default:
			fail("Not implemented");
	}
}

function amendMarkList<TNodeChange>(
	marks: MarkList<TNodeChange>,
	revision: RevisionTag | undefined,
	crossFieldManager: CrossFieldManager<TNodeChange>,
): MarkList<TNodeChange> {
	const factory = new MarkListFactory<TNodeChange>();

	for (const mark of marks) {
		if (isMoveOut(mark) || isReturnFrom(mark)) {
			factory.push(...applyMovedChanges(mark, revision, crossFieldManager));
		} else {
			factory.push(mark);
		}
	}

	return factory.list;
}

function applyMovedChanges<TNodeChange>(
	mark: MoveOutMark<TNodeChange> | ReturnFromMark<TNodeChange>,
	revision: RevisionTag | undefined,
	manager: CrossFieldManager<TNodeChange>,
): Mark<TNodeChange>[] {
	// Although this is a source mark, we query the destination because this was a destination mark during the original invert pass.
	const effect = getEffect<MoveOut<TNodeChange> | ReturnFrom<TNodeChange>>(mark);
	const entry = manager.get(
		CrossFieldTarget.Destination,
		effect.revision ?? revision,
		effect.id,
		mark.count,
		true,
	);
	if (entry === undefined) {
		return [mark];
	}

	if (entry.start > effect.id) {
		// The entry does not apply to the first cell in the mark.
		const [mark1, mark2] = splitMark(mark, entry.start - effect.id);
		return [mark1, ...applyMovedChanges(mark2, revision, manager)];
	} else if (entry.start + entry.length < (effect.id as number) + mark.count) {
		// The entry applies to the first cell in the mark, but not the mark's entire range.
		const [mark1, mark2] = splitMark(mark, entry.start + entry.length - effect.id);
		return [withNodeChange(mark1, entry.value), ...applyMovedChanges(mark2, revision, manager)];
	} else {
		// The entry applies to all cells in the mark.
		return [withNodeChange(mark, entry.value)];
	}
}

function invertModifyOrSkip<TNodeChange>(
	length: number,
	changes: TNodeChange | undefined,
	index: number,
	inverter: NodeChangeInverter<TNodeChange>,
	detachEvent?: ChangeAtomId,
): Mark<TNodeChange> {
	if (changes !== undefined) {
		assert(length === 1, 0x66c /* A modify mark must have length equal to one */);
		const modify: Modify<TNodeChange> = { type: "Modify", changes: inverter(changes, index) };
		const mark: Mark<TNodeChange> = { count: 1, effects: [modify] };
		if (detachEvent !== undefined) {
			mark.cellId = detachEvent;
		}
		return mark;
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
