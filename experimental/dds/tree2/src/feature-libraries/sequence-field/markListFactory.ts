/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { RevisionTag } from "../../core";
import { Mark, MarkList, ObjectMark, Skip } from "./format";
import { MoveEffectTable } from "./moveEffectTable";
import { isObjMark, isSkipMark, tryExtendMark } from "./utils";

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

	public constructor(
		// TODO: Is there a usage of MarkListFactory where we need a non-undefined revision?
		private readonly revision?: RevisionTag | undefined,
		private readonly moveEffects?: MoveEffectTable<TNodeChange>,
		private readonly recordMerges: boolean = false,
	) {}

	public push(...marks: Mark<TNodeChange>[]): void {
		for (const item of marks) {
			if (isSkipMark(item)) {
				this.pushOffset(item);
			} else {
				this.pushContent(item);
			}
		}
	}

	public pushOffset(offset: Skip): void {
		this.offset += offset;
	}

	public pushContent(mark: ObjectMark<TNodeChange>): void {
		if (this.offset > 0) {
			this.list.push(this.offset);
			this.offset = 0;
		}
		const prev = this.list[this.list.length - 1];
		if (isObjMark(prev) && prev.type === mark.type) {
			if (tryExtendMark(prev, mark, this.revision, this.moveEffects, this.recordMerges)) {
				return;
			}
		}
		this.list.push(mark);
	}
}
