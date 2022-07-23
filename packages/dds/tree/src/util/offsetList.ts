/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

export type OffsetList<TContent = Exclude<unknown, number>, TOffset = number> = (TOffset | TContent)[];

/**
 * Helper class for constructing an offset list that...
 *  - Does not insert offsets if there is no content after them
 *  - Merges runs offsets together
 */
export class OffsetListFactory<TContent> {
	private offset = 0;
	public readonly list: OffsetList<TContent> = [];

	public pushOffset(offset: number): void {
		this.offset += offset;
	}

	public pushContent(content: TContent): void {
		if (this.offset > 0) {
			this.list.push(this.offset);
			this.offset = 0;
		}
		this.list.push(content);
	}
}
