/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

export class TextMatch {
    constructor(public readonly text: string) {}

    public match(text: string): IMatchData {
        const firstIncorrectIndex = this.findDiffIndex(this.text, text);

        const correctText = this.text.slice(0, firstIncorrectIndex);
        const badEndIndex = firstIncorrectIndex >= text.length
            ? firstIncorrectIndex
            : this.text.length > text.length
                ? text.length
                : this.text.length;
        const incorrectText = this.text.slice(firstIncorrectIndex, badEndIndex);
        const badText = text.slice(firstIncorrectIndex);
        const remainingText = this.text.slice(badEndIndex);

        return {
            firstIncorrectIndex,
            correctText,
            incorrectText,
            remainingText,
            badText,
        };
    }

    private findDiffIndex(text1: string, text2: string): number {
        const len = text1.length < text2.length ? text1.length : text2.length;
        let i = 0;
        for (i = 0; i < len; i++) {
            if (text1[i] !== text2[i]) {
                return i;
            }
        }
        return i;
    }
}

export interface IMatchData {
    readonly firstIncorrectIndex: number;
    readonly correctText: string;
    readonly incorrectText: string;
    readonly remainingText: string;
    readonly badText: string;
}
