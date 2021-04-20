/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

export function lis(seq: number[]) {
    if (!seq.length) {
        return seq;
    }

    const piles = seq.reduce<{ value: number, prev?: number }[][]>((res, value) => {
        let lo = 0;
        let hi = res.length;

        while (lo < hi) {
            // eslint-disable-next-line no-bitwise
            const mid = (lo + hi) >> 1;
            const pile = res[mid];
            if (pile && value > pile[pile.length - 1].value) {
                lo = mid + 1;
            } else {
                hi = mid;
            }
        }

        const prevPile = res[lo - 1];
        const entry = { value, prev: prevPile && prevPile.length - 1 };

        if (lo === res.length) {
            res.push([entry]);
        } else {
            res[lo].push(entry);
        }

        return res;
    }, []);

    const result: number[] = [];
    const lastPileIndex = piles.length - 1;
    let cardIndex = piles[lastPileIndex].length - 1;

    for (let pileIndex = lastPileIndex; pileIndex >= 0; pileIndex--) {
        const pile = piles[pileIndex];
        const entry = pile[cardIndex];
        result.unshift(entry.value);
        // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
        cardIndex = entry.prev!;
    }

    return result;
}
