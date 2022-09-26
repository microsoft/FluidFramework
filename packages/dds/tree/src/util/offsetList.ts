/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

export type OffsetList<TContent = Exclude<unknown, number>, TOffset = number> = (TOffset | TContent)[];

/**
 * Helper class for constructing an offset list that...
 *
 * - Does not insert offsets if there is no content after them
 *
 * - Does not insert 0-sized offsets
 *
 * - Merges runs of offsets together
 */
export class OffsetListFactory<TContent> {
    private offset = 0;
    public readonly list: OffsetList<TContent> = [];

    public push(...offsetOrContent: (number | TContent)[]): void {
        for (const item of offsetOrContent) {
            if (typeof item === "number") {
                this.pushOffset(item);
            } else {
                this.pushContent(item);
            }
        }
    }

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
