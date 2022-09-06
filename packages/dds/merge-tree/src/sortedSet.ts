export abstract class SortedSet<T, U extends string | number> {
    protected abstract getOrdinal(t: T): U;

    protected readonly ordinalSortedItems: T[] = [];

    public get size(): number {
        return this.ordinalSortedItems.length;
    }

    public get items(): readonly T[] {
        return this.ordinalSortedItems;
    }

    public addOrUpdate(newItem: T, update?: (existingItem: T, newItem: T) => void) {
        const position = this.findItemPosition(newItem);
        if (position.exists) {
            if (update) {
                update(this.ordinalSortedItems[position.index], newItem);
            }
        } else {
            this.ordinalSortedItems.splice(position.index, 0, newItem);
        }
    }

    public remove(item: T): boolean {
        const position = this.findItemPosition(item);
        if (position.exists) {
            this.ordinalSortedItems.splice(position.index, 1);
            return true;
        }
        return false;
    }

    public has(item: T): boolean {
        const position = this.findItemPosition(item);
        return position.exists;
    }

    private findItemPosition(item: T): { exists: boolean; index: number; } {
        if (this.ordinalSortedItems.length === 0) {
            return { exists: false, index: 0 };
        }
        let start = 0;
        let end = this.ordinalSortedItems.length - 1;
        const itemOrdinal = this.getOrdinal(item);
        let index = -1;

        while (start <= end) {
            index = start + Math.floor((end - start) / 2);
            const indexOrdinal = this.getOrdinal(this.ordinalSortedItems[index]);
            if (indexOrdinal > itemOrdinal) {
                if (start === index) {
                    return { exists: false, index };
                }
                end = index - 1;
            } else if (indexOrdinal < itemOrdinal) {
                if (index === end) {
                    return { exists: false, index: index + 1 };
                }
                start = index + 1;
            } else if (indexOrdinal === itemOrdinal) {
                // at this point we've found the ordinal of the item
                // so we need to find the index of the item instance
                //
                if (item === this.ordinalSortedItems[index]) {
                    return { exists: true, index };
                }
                for (let b = index - 1; b >= 0 && this.getOrdinal(this.ordinalSortedItems[b]) === itemOrdinal; b--) {
                    if (this.ordinalSortedItems[b] === item) {
                        return { exists: true, index: b };
                    }
                }
                for (index + 1;
                    index < this.ordinalSortedItems.length
                        && this.getOrdinal(this.ordinalSortedItems[index]) === itemOrdinal;
                    index++
                ) {
                    if (this.ordinalSortedItems[index] === item) {
                        return { exists: true, index };
                    }
                }
                return { exists: false, index };
            }
        }
        return { exists: false, index };
    }
}
