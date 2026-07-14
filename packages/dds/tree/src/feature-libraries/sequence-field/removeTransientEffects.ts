/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import type { ChangeAtomId, RevisionTag } from "../../core/index.js";
import { brand } from "../../util/index.js";

import { MarkListFactory } from "./markListFactory.js";
import type { Changeset, Mark } from "./types.js";
import { splitMark } from "./utils.js";

/**
 * A predicate identifying "transient" built cells: cells whose content was created by this change but
 * is not present in the resulting document (i.e. it was created and then removed within the change).
 */
export type IsTransientBuildCell = (id: ChangeAtomId) => boolean;

function moveKey(revision: RevisionTag | undefined, id: number): string {
	return `${revision === undefined ? "" : String(revision)}:${id}`;
}

/**
 * Returns the {@link MoveId} carried by a mark's attach effect (a `MoveIn`, possibly nested within an
 * `AttachAndDetach`), or `undefined` if the mark does not attach content via a move.
 */
function getAttachMoveId(
	mark: Mark,
): { readonly revision: RevisionTag | undefined; readonly id: number } | undefined {
	if (mark.type === "MoveIn") {
		return { revision: mark.revision, id: mark.id };
	}
	if (mark.type === "AttachAndDetach" && mark.attach.type === "MoveIn") {
		return { revision: mark.attach.revision, id: mark.attach.id };
	}
	return undefined;
}

/**
 * Returns the {@link MoveId} carried by a mark's detach effect (a `MoveOut`, possibly nested within an
 * `AttachAndDetach`), or `undefined` if the mark does not detach content via a move.
 */
function getDetachMoveId(
	mark: Mark,
): { readonly revision: RevisionTag | undefined; readonly id: number } | undefined {
	if (mark.type === "MoveOut") {
		return { revision: mark.revision, id: mark.id };
	}
	if (mark.type === "AttachAndDetach" && mark.detach.type === "MoveOut") {
		return { revision: mark.detach.revision, id: mark.detach.id };
	}
	return undefined;
}

/**
 * Removes the sequence-field effects associated with transient nodes: nodes that were built by this
 * change but do not survive it (they are created and then removed, possibly after being moved).
 *
 * @remarks
 * A transient node first appears at a build cell, where it is either removed outright (a `Remove` mark
 * whose `cellId` is the build cell) or moved away (a `MoveOut` mark whose `cellId` is the build cell). If
 * it is moved, the destination is reached via a move id and is itself either removed
 * (an `AttachAndDetach` of `MoveIn` ○ `Remove`) or moved again. This walk follows those move ids to a
 * fixed point so that every mark belonging to a transient node's lifecycle is identified and dropped.
 *
 * Because every such mark targets an empty input cell (its `cellId` is defined), dropping it does not
 * shift the position of any surviving cell, so the resulting change has the same observable effect.
 */
export function removeTransientEffects(
	change: Changeset,
	{ isTransientBuildCell }: { readonly isTransientBuildCell: IsTransientBuildCell },
): Changeset {
	// Move ids whose source content is transient. Any mark that attaches content via one of these moves
	// is therefore also transient.
	const deadMoves = new Set<string>();

	// Seed: a transient node that is moved away from its build cell contributes a `MoveOut` whose cellId
	// is the (transient) build cell. Record that move as dead.
	for (const mark of change) {
		if (mark.cellId === undefined) {
			continue;
		}
		for (let offset = 0; offset < mark.count; offset += 1) {
			const cell: ChangeAtomId = {
				revision: mark.cellId.revision,
				localId: brand(mark.cellId.localId + offset),
			};
			if (isTransientBuildCell(cell) && mark.type === "MoveOut") {
				deadMoves.add(moveKey(mark.revision, (mark.id as number) + offset));
			}
		}
	}

	// Propagate: a mark that attaches content via a dead move is itself transient. If it then moves that
	// content on again, that subsequent move is also dead. Iterate to a fixed point.
	let changed = true;
	while (changed) {
		changed = false;
		for (const mark of change) {
			const attachMove = getAttachMoveId(mark);
			if (attachMove === undefined) {
				continue;
			}
			for (let offset = 0; offset < mark.count; offset += 1) {
				if (!deadMoves.has(moveKey(attachMove.revision, attachMove.id + offset))) {
					continue;
				}
				const detachMove = getDetachMoveId(mark);
				if (detachMove !== undefined) {
					const key = moveKey(detachMove.revision, detachMove.id + offset);
					if (!deadMoves.has(key)) {
						deadMoves.add(key);
						changed = true;
					}
				}
			}
		}
	}

	const isTransientOffset = (mark: Mark, offset: number): boolean => {
		if (mark.cellId !== undefined) {
			const cell: ChangeAtomId = {
				revision: mark.cellId.revision,
				localId: brand(mark.cellId.localId + offset),
			};
			if (isTransientBuildCell(cell)) {
				return true;
			}
		}
		const attachMove = getAttachMoveId(mark);
		if (
			attachMove !== undefined &&
			deadMoves.has(moveKey(attachMove.revision, attachMove.id + offset))
		) {
			return true;
		}
		return false;
	};

	const factory = new MarkListFactory();
	for (const mark of change) {
		let remaining: Mark = mark;
		while (remaining.count > 0) {
			const transient = isTransientOffset(remaining, 0);
			// Find the extent of the current run of same-transience cells.
			let runLength = 1;
			while (
				runLength < remaining.count &&
				isTransientOffset(remaining, runLength) === transient
			) {
				runLength += 1;
			}
			if (runLength === remaining.count) {
				if (!transient) {
					factory.push(remaining);
				}
				break;
			}
			const [head, tail] = splitMark(remaining, runLength);
			if (!transient) {
				factory.push(head);
			}
			remaining = tail;
		}
	}

	return factory.list;
}
