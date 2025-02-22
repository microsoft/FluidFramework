/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

/**
 * @internal
 */
export abstract class SortedSet<T> {
	/**
	 * Standard comparator semantics:
	 * - If a \< b, return a negative number
	 * - If a \> b, return a positive number
	 * - If a and b are equivalent, return 0
	 */
	protected abstract compare(a: T, b: T): number;

	protected readonly sortedItems: T[] = [];

	public get size(): number {
		return this.sortedItems.length;
	}

	public get items(): readonly T[] {
		return this.sortedItems;
	}

	public addOrUpdate(newItem: T, update?: (existingItem: T, newItem: T) => void): void {
		const position = this.findItemPosition(newItem);
		if (position.exists) {
			update?.(this.sortedItems[position.index], newItem);
		} else {
			this.sortedItems.splice(position.index, 0, newItem);
		}
	}

	public remove(item: T): boolean {
		const position = this.findItemPosition(item);
		if (position.exists) {
			this.sortedItems.splice(position.index, 1);
			return true;
		}
		return false;
	}

	public has(item: T): boolean {
		const position = this.findItemPosition(item);
		return position.exists;
	}

	protected findItemPosition(item: T): { exists: boolean; index: number } {
		if (this.sortedItems.length === 0) {
			return { exists: false, index: 0 };
		}
		let start = 0;
		let end = this.sortedItems.length - 1;
		let index = -1;

		while (start <= end) {
			index = start + Math.floor((end - start) / 2);
			const compareResult = this.compare(item, this.sortedItems[index]);
			if (compareResult < 0) {
				if (start === index) {
					return { exists: false, index };
				}
				end = index - 1;
			} else if (compareResult > 0) {
				if (index === end) {
					return { exists: false, index: index + 1 };
				}
				start = index + 1;
			} else if (compareResult === 0) {
				return this.onFindEquivalent(item, index);
			}
		}
		return { exists: false, index };
	}

	/**
	 * Invoked when `findItemPosition` finds an equivalent item (i.e. `compare` returns 0 between that item and the search item).
	 *
	 * By default, `SortedSet` assumes that equivalent items are equal and returns the found index.
	 * @param item - The item that is being searched for (argument to `findItemPosition`)
	 * @param index - The index of the equivalent item in the sorted set
	 */
	protected onFindEquivalent(item: T, index: number): { exists: boolean; index: number } {
		return { exists: true, index };
	}
}
