/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

export function lis(seq: number[]) {
    if (!seq.length) {
        return seq;
    }

    // eslint-disable-next-line no-shadow
    const piles = seq.reduce<{ value: number, prev?: number }[][]>((result, value) => {
        let lo = 0;
        let hi = result.length;

        while (lo < hi) {
            // eslint-disable-next-line no-bitwise
            const mid = (lo + hi) >> 1;
            const pile = result[mid];
            if (pile && value > pile[pile.length - 1].value) {
                lo = mid + 1;
            } else {
                hi = mid;
            }
        }

        const prevPile = result[lo - 1];
        const entry = { value, prev: prevPile && prevPile.length - 1 };

        if (lo === result.length) {
            result.push([entry]);
        } else {
            result[lo].push(entry);
        }

        return result;
    }, []);

    const result: number[] = [];
    const lastPileIndex = piles.length - 1;
    let cardIndex = piles[lastPileIndex].length - 1;

    for (let pileIndex = lastPileIndex; pileIndex >= 0; pileIndex--) {
        const pile = piles[pileIndex];
        const entry = pile[cardIndex];
        result.unshift(entry.value);
        // eslint-disable-next-line max-len
        // eslint-disable-next-line @typescript-eslint/no-non-null-assertion, @typescript-eslint/no-unnecessary-type-assertion
        cardIndex = entry.prev!;
    }

    return result;
}
