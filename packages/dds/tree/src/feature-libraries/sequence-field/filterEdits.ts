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
	getAttachedRootId,
	getDetachedRootId,
	getDetachOutputCellId,
	omitMarkEffect,
} from "./utils.js";
import { MarkQueueBase } from "./markQueue.js";
import { unreachableCase } from "@fluidframework/core-utils/internal";

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
		case "Attach": {
			const attachId = getAttachedRootId(mark);
			const result = filterAttach(attachId, mark.count);

			let filtered: Mark;
			switch (result.value) {
				case EditFilterStatus.Preserve: {
					filtered = mark;
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
		case "Detach": {
			const detachId = getDetachedRootId(mark);
			const result = filterDetach(detachId, mark.count);

			let filtered: Mark;
			switch (result.value) {
				case EditFilterStatus.Preserve: {
					filtered = mark;
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

		case NoopMarkType:
		case "Rename": {
			return preserveOtherEdits ? mark : omitMarkEffect(mark);
		}
		default: {
			unreachableCase(type);
		}
	}
}
