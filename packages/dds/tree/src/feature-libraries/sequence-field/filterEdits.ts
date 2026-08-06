/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import {
	EditFilterStatus,
	type FilterAttachFunc,
	type FilterDetachFunc,
} from "../modular-schema/index.js";
import { MarkListFactory } from "./markListFactory.js";
import { NoopMarkType, type Changeset, type Mark } from "./types.js";
import {
	getDetachedNodeId,
	getDetachOutputCellId,
	getOutputCellId,
	omitMarkEffect,
} from "./utils.js";
import { MarkQueueBase } from "./markQueue.js";
import { assert, fail, unreachableCase } from "@fluidframework/core-utils/internal";

export function filterEdits(
	change: Changeset,
	options: {
		filterDetach: FilterDetachFunc;
		filterAttach: FilterAttachFunc;
		preserveOtherEdits: boolean;
	},
): Changeset {
	const factory = new MarkListFactory();
	const queue = new MarkQueueBase(change);
	for (let mark = queue.peek(); mark !== undefined; mark = queue.peek()) {
		const filtered = filterMark(
			mark,
			options.filterDetach,
			options.filterAttach,
			options.preserveOtherEdits,
		);
		factory.push(filtered);
		queue.dequeueUpTo(filtered.count);
	}

	return factory.list;
}

function filterMark(
	mark: Mark,
	filterDetach: FilterDetachFunc,
	filterAttach: FilterAttachFunc,
	preserveOtherEdits: boolean,
): Mark {
	const type = mark.type;
	switch (type) {
		case "Insert":
		case "MoveIn": {
			if (mark.cellId === undefined) {
				return preserveOtherEdits ? mark : omitMarkEffect(mark);
			}

			const attachId =
				mark.type === "MoveIn" ? { revision: mark.revision, localId: mark.id } : mark.cellId;

			const endpoint = mark.type === "MoveIn" ? mark.finalEndpoint : undefined;
			const result = filterAttach(attachId, mark.count, undefined, endpoint);

			let filtered: Mark;
			switch (result.value) {
				case EditFilterStatus.Preserve: {
					filtered = mark;
					break;
				}
				case EditFilterStatus.PreserveWithoutMove: {
					// KLUDGE: PreserveWithoutMove requires us to return a mark which attaches the node
					// using the detach ID of the move (the endpoint ID).
					// Insert marks use the cell ID as the attach ID, so we must change the cell ID here.
					// This could be a problem if there were references to the old cell ID outside this changeset,
					// but PreserveWithoutMove is only used for transaction minimization, where that is not a problem.
					const newCellId = endpoint ?? { revision: mark.revision, localId: mark.id };
					filtered = {
						type: "Insert",
						count: result.length,
						cellId: newCellId,
						revision: mark.revision,
						id: mark.id,
					};
					break;
				}
				case EditFilterStatus.Remove: {
					filtered = omitMarkEffect(mark);
					break;
				}
				default: {
					unreachableCase(result.value);
				}
			}

			return { ...filtered, count: result.length };
		}
		case "Remove":
		case "MoveOut": {
			const detachId = getDetachedNodeId(mark);
			const endpoint = mark.type === "MoveOut" ? mark.finalEndpoint : undefined;
			const result = filterDetach(detachId, mark.count, mark.cellId, endpoint);

			let filtered: Mark;
			switch (result.value) {
				case EditFilterStatus.Preserve: {
					filtered = mark;
					break;
				}
				case EditFilterStatus.PreserveWithoutMove: {
					const outputCellId = getDetachOutputCellId(mark);
					filtered = {
						type: "Remove",
						count: mark.count,
						revision: outputCellId.revision,
						id: outputCellId.localId,
					};

					if (mark.changes !== undefined) {
						filtered.changes = mark.changes;
					}

					break;
				}
				case EditFilterStatus.Remove: {
					filtered = omitMarkEffect(mark);
					break;
				}
				default: {
					unreachableCase(result.value);
				}
			}
			return { ...filtered, count: result.length };
		}
		case "AttachAndDetach": {
			assert(
				mark.attach.type === "MoveIn",
				"AttachAndDetach marks in changesets should always represent MoveIn + Remove",
			);

			if (mark.cellId === undefined) {
				return preserveOtherEdits ? mark : omitMarkEffect(mark);
			}

			const result = filterAttach(
				{ revision: mark.attach.revision, localId: mark.attach.id },
				mark.count,
				getOutputCellId(mark),
				mark.attach.finalEndpoint,
			);

			const filtered =
				result.value === EditFilterStatus.Preserve ? mark : omitMarkEffect(mark);

			return { ...filtered, count: result.length };
		}
		case NoopMarkType:
		case "Rename": {
			return preserveOtherEdits ? mark : omitMarkEffect(mark);
		}
		default: {
			unreachableCase(type);
		}
	}
}
