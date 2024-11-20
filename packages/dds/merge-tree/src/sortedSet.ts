/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

/**
 * @internal
 */
export abstract class SortedSet<T, U extends string | number> {
	protected abstract getKey(t: T): U;

	protected readonly keySortedItems: T[] = [];

	public get size(): number {
		return this.keySortedItems.length;
	}

	public get items(): readonly T[] {
		return this.keySortedItems;
	}

	public addOrUpdate(newItem: T, update?: (existingItem: T, newItem: T) => void): void {
		const position = this.findItemPosition(newItem);
		if (position.exists) {
			update?.(this.keySortedItems[position.index], newItem);
		} else {
			this.keySortedItems.splice(position.index, 0, newItem);
		}
	}

	public remove(item: T): boolean {
		const position = this.findItemPosition(item);
		if (position.exists) {
			this.keySortedItems.splice(position.index, 1);
			return true;
		}
		return false;
	}

	public has(item: T): boolean {
		const position = this.findItemPosition(item);
		return position.exists;
	}

	protected findItemPosition(item: T): { exists: boolean; index: number } {
		if (this.keySortedItems.length === 0) {
			return { exists: false, index: 0 };
		}
		let start = 0;
		let end = this.keySortedItems.length - 1;
		const itemKey = this.getKey(item);
		let index = -1;

		while (start <= end) {
			index = start + Math.floor((end - start) / 2);
			const indexKey = this.getKey(this.keySortedItems[index]);
			if (indexKey > itemKey) {
				if (start === index) {
					return { exists: false, index };
				}
				end = index - 1;
			} else if (indexKey < itemKey) {
				if (index === end) {
					return { exists: false, index: index + 1 };
				}
				start = index + 1;
			} else if (indexKey === itemKey) {
				return { exists: true, index };
			}
		}
		return { exists: false, index };
	}
}
