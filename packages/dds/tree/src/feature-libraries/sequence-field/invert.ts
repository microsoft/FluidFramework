/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { assert, unreachableCase } from "@fluidframework/core-utils";
import { RevisionMetadataSource, RevisionTag, TaggedChange } from "../../core/index.js";
import { IdAllocator, Mutable, fail } from "../../util/index.js";
import { CrossFieldManager, CrossFieldTarget } from "../modular-schema/index.js";
import {
	Changeset,
	Mark,
	MarkList,
	NoopMarkType,
	MoveOut,
	NoopMark,
	Remove,
	CellMark,
	MoveIn,
	MarkEffect,
	CellId,
} from "./types.js";
import { MarkListFactory } from "./markListFactory.js";
import {
	extractMarkEffect,
	getDetachOutputId,
	getEndpoint,
	getInputCellId,
	getOutputCellId,
	isAttach,
	isDetach,
	isImpactful,
	isReattach,
	normalizeCellRename,
	splitMark,
	withNodeChange,
} from "./utils.js";
import { DetachIdOverrideType } from "./format.js";

export type NodeChangeInverter<TNodeChange> = (change: TNodeChange) => TNodeChange;

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
	revisionMetadata: RevisionMetadataSource,
): Changeset<TNodeChange> {
	return invertMarkList(
		change.change,
		change.revision,
		invertChild,
		crossFieldManager as CrossFieldManager<TNodeChange>,
		revisionMetadata,
	);
}

function invertMarkList<TNodeChange>(
	markList: MarkList<TNodeChange>,
	revision: RevisionTag | undefined,
	invertChild: NodeChangeInverter<TNodeChange>,
	crossFieldManager: CrossFieldManager<TNodeChange>,
	revisionMetadata: RevisionMetadataSource,
): MarkList<TNodeChange> {
	const inverseMarkList = new MarkListFactory<TNodeChange>();

	for (const mark of markList) {
		const inverseMarks = invertMark(
			mark,
			revision,
			invertChild,
			crossFieldManager,
			revisionMetadata,
		);
		inverseMarkList.push(...inverseMarks);
	}

	return inverseMarkList.list;
}

function invertMark<TNodeChange>(
	mark: Mark<TNodeChange>,
	revision: RevisionTag | undefined,
	invertChild: NodeChangeInverter<TNodeChange>,
	crossFieldManager: CrossFieldManager<TNodeChange>,
	revisionMetadata: RevisionMetadataSource,
): Mark<TNodeChange>[] {
	if (!isImpactful(mark, revision, revisionMetadata)) {
		const inputId = getInputCellId(mark, revision, revisionMetadata);
		return [invertNodeChangeOrSkip(mark.count, mark.changes, invertChild, inputId)];
	}
	const type = mark.type;
	switch (type) {
		case NoopMarkType: {
			const inverse = { ...mark };
			if (mark.changes !== undefined) {
				inverse.changes = invertChild(mark.changes);
			}
			return [inverse];
		}
		case "Remove": {
			assert(revision !== undefined, 0x5a1 /* Unable to revert to undefined revision */);
			const outputId = getOutputCellId(mark, revision, revisionMetadata);
			const inputId = getInputCellId(mark, revision, revisionMetadata);
			const inverse: Mark<TNodeChange> =
				inputId === undefined
					? {
							type: "Insert",
							id: mark.id,
							cellId: outputId,
							count: mark.count,
					  }
					: {
							type: "Remove",
							id: mark.id,
							cellId: outputId,
							count: mark.count,
							idOverride: {
								type: DetachIdOverrideType.Redetach,
								id: inputId,
							},
					  };
			return [withNodeChange(inverse, invertNodeChange(mark.changes, invertChild))];
		}
		case "Insert": {
			const inputId = getInputCellId(mark, revision, revisionMetadata);
			assert(inputId !== undefined, 0x80c /* Active inserts should target empty cells */);
			const removeMark: Mutable<CellMark<Remove, TNodeChange>> = {
				type: "Remove",
				count: mark.count,
				id: inputId.localId,
			};

			removeMark.idOverride = {
				type: isReattach(mark)
					? DetachIdOverrideType.Redetach
					: DetachIdOverrideType.Unattach,
				id: inputId,
			};

			const inverse = withNodeChange(removeMark, invertNodeChange(mark.changes, invertChild));
			return [inverse];
		}
		case "MoveOut": {
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
					invertChild(mark.changes),
					true,
				);
			}

			const cellId = getDetachOutputId(
				mark,
				mark.revision ?? revision ?? fail("Revision must be defined"),
				revisionMetadata,
			) ?? {
				revision: mark.revision ?? revision ?? fail("Revision must be defined"),
				localId: mark.id,
			};

			const moveIn: MoveIn = {
				type: "MoveIn",
				id: mark.id,
			};

			if (mark.finalEndpoint !== undefined) {
				moveIn.finalEndpoint = { localId: mark.finalEndpoint.localId };
			}
			let effect: MarkEffect = moveIn;
			const inputId = getInputCellId(mark, revision, revisionMetadata);
			if (inputId !== undefined) {
				effect = {
					type: "AttachAndDetach",
					attach: moveIn,
					detach: {
						type: "Remove",
						id: mark.id,
						idOverride: {
							type: DetachIdOverrideType.Redetach,
							id: inputId,
						},
					},
				};
			}
			return [{ ...effect, count: mark.count, cellId }];
		}
		case "MoveIn": {
			const inputId = getInputCellId(mark, revision, revisionMetadata);
			assert(inputId !== undefined, 0x89e /* Active move-ins should target empty cells */);
			const invertedMark: Mutable<CellMark<MoveOut, TNodeChange>> = {
				type: "MoveOut",
				id: mark.id,
				count: mark.count,
			};

			if (mark.finalEndpoint) {
				invertedMark.finalEndpoint = { localId: mark.finalEndpoint.localId };
			}

			invertedMark.idOverride = {
				type: isReattach(mark)
					? DetachIdOverrideType.Redetach
					: DetachIdOverrideType.Unattach,
				id: inputId,
			};

			return applyMovedChanges(invertedMark, revision, crossFieldManager);
		}
		case "AttachAndDetach": {
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
				revision,
				invertChild,
				crossFieldManager,
				revisionMetadata,
			);
			const detachInverses = invertMark(
				detach,
				revision,
				invertChild,
				crossFieldManager,
				revisionMetadata,
			);

			if (detachInverses.length === 0) {
				return attachInverses;
			}

			assert(
				detachInverses.length === 1,
				0x80d /* Only expected MoveIn marks to be split when inverting */,
			);

			let detachInverse = detachInverses[0];
			assert(isAttach(detachInverse), 0x80e /* Inverse of a detach should be an attach */);

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
						assert(
							detachInverseCurr.changes === undefined,
							0x80f /* Unexpected node changes */,
						);
						detachInverseCurr.changes = attachInverse.changes;
					}
					inverses.push(detachInverseCurr);
					continue;
				}
				assert(
					isDetach(attachInverse),
					0x810 /* Inverse of an attach should be a detach */,
				);

				const inverted: Mark<TNodeChange> = {
					type: "AttachAndDetach",
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
					assert(inverted.changes === undefined, 0x811 /* Unexpected node changes */);
					inverted.changes = attachInverse.changes;
				}

				inverses.push(normalizeCellRename(inverted));
			}

			return inverses;
		}
		default:
			unreachableCase(type);
	}
}

function applyMovedChanges<TNodeChange>(
	mark: CellMark<MoveOut, TNodeChange>,
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
			entry.value !== undefined
				? withNodeChange<CellMark<MoveOut, TNodeChange>, MoveOut, TNodeChange>(
						mark1,
						entry.value,
				  )
				: mark1;

		return [mark1WithChanges, ...applyMovedChanges(mark2, revision, manager)];
	}

	if (entry.value !== undefined) {
		return [
			withNodeChange<CellMark<MoveOut, TNodeChange>, MoveOut, TNodeChange>(mark, entry.value),
		];
	}

	return [mark];
}

function invertNodeChangeOrSkip<TNodeChange>(
	count: number,
	changes: TNodeChange | undefined,
	inverter: NodeChangeInverter<TNodeChange>,
	cellId?: CellId,
): Mark<TNodeChange> {
	if (changes !== undefined) {
		assert(count === 1, 0x66c /* A modify mark must have length equal to one */);
		const noop: CellMark<NoopMark, TNodeChange> = {
			count,
			changes: inverter(changes),
		};
		if (cellId !== undefined) {
			noop.cellId = cellId;
		}
		return noop;
	}

	if (cellId !== undefined) {
		return { count, cellId };
	}
	return { count };
}

function invertNodeChange<TNodeChange>(
	change: TNodeChange | undefined,
	inverter: NodeChangeInverter<TNodeChange>,
): TNodeChange | undefined {
	return change === undefined ? undefined : inverter(change);
}
