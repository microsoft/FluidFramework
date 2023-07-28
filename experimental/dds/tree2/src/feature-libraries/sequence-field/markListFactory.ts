/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { Mark, MarkList } from "./format";
import { isNoop, tryExtendMark } from "./utils";

/**
 * Helper class for constructing an offset list of marks that...
 * - Does not insert offsets if there is no content after them
 * - Does not insert 0-sized offsets
 * - Merges runs of offsets together
 * - Merges marks together
 */
export class MarkListFactory<TNodeChange> {
	private offset = 0;
	public readonly list: MarkList<TNodeChange> = [];

	public constructor() {}

	public push(...marks: Mark<TNodeChange>[]): void {
		for (const item of marks) {
			if (isNoop(item)) {
				this.pushOffset(item.count);
			} else {
				this.pushMark(item);
			}
		}
	}

	public pushOffset(offset: number): void {
		this.offset += offset;
	}

	public pushMark(mark: Mark<TNodeChange>): void {
		if (mark.effects === undefined) {
			this.pushOffset(mark.count);
		} else {
			if (this.offset > 0) {
				this.list.push({ count: this.offset });
				this.offset = 0;
			}
			const prev = this.list[this.list.length - 1];
			if (prev !== undefined) {
				if (tryExtendMark(prev, mark)) {
					return;
				}
			}
			this.list.push(mark);
		}
	}
}
