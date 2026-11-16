/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { assert } from "@fluidframework/core-utils/internal";

import type { DetachedNodeId, Mark } from "./delta.js";

/**
 * Constructs a list of delta marks for a field.
 * Omits zero-count marks and trailing retains, combines adjacent retains without nested changes,
 * and merges adjacent marks whose attached and detached ID ranges are consecutive.
 * Marks with nested field changes are never merged because they must affect exactly one node.
 */
export class DeltaMarkListFactory {
	private offset = 0;

	/**
	 * The accumulated marks, excluding pending trailing retains.
	 */
	public readonly list: Mark[] = [];

	/**
	 * Appends a mark without modifying it.
	 * @param mark - A valid delta mark, or a zero-count mark to omit.
	 */
	public push(mark: Mark): void {
		assert(mark.count >= 0, "Mark count must be greater or equal to zero");
		if (mark.count === 0) {
			return;
		}
		if (mark.attach === undefined && mark.detach === undefined && mark.fields === undefined) {
			this.offset += mark.count;
			return;
		}
		if (this.offset > 0) {
			this.list.push({ count: this.offset });
			this.offset = 0;
		}
		const prev = this.list.at(-1);
		if (
			prev !== undefined &&
			prev.fields === undefined &&
			mark.fields === undefined &&
			areConsecutiveIds(prev.attach, mark.attach, prev.count) &&
			areConsecutiveIds(prev.detach, mark.detach, prev.count)
		) {
			this.list[this.list.length - 1] = { ...prev, count: prev.count + mark.count };
		} else {
			this.list.push(mark);
		}
	}
}

/**
 * Checks whether two marks omit an ID range or describe consecutive ranges of the same kind.
 */
function areConsecutiveIds(
	first: DetachedNodeId | undefined,
	second: DetachedNodeId | undefined,
	count: number,
): boolean {
	return first === undefined || second === undefined
		? first === second
		: first.major === second.major && first.minor + count === second.minor;
}
