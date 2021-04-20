/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

/**
 * Returns a longest increasing subsequence of the given array 'x' in O(n log n) time.
 * {@link https://en.wikipedia.org/wiki/Longest_increasing_subsequence}
 */
export function lis(x: number[]): number[] {
    // Avoid returning '[ undefined ]' for an empty sequence.  The 'undefined' happens because we begin
    // with the initial state i = 1, m = [ 0 ].  For an empty sequence, 'x[m[0]]' -> undefined.
    if (!x.length) {
        return x;
    }

    // 'm[j]' stores the index 'k' of 'x[k]' that terminates the increasing subsequence of length 'j'.
    // (e.g., m[3] is the index of the last element of the increasing subsequence of length 3).
    //
    // Note that there may be multiple increasing subsequences of length 'j'.  The always algorithm
    // maintains the m[j] that terminates the subsequence with the smallest value of x[m[j]] found so
    // far.
    const m = [0];

    // p[k] stores the index of the predecessor of x[k] in the longest increasing subsequence ending at x[k].
    const p = new Array<number>(x.length);

    for (let i = 1; i < x.length; i++) {
        // Test if x[i] can be used to extend the current longest increasing sequence at m[j].  If so,
        // we have just discovered a new longest increasing subsequence of length 'j + 1' with predecessor
        // m[j].  Record it and continue w/the next iteration of the loop.
        {
            const mj = m[m.length - 1];
            if (x[mj] < x[i]) {
                p[i] = mj;
                m.push(i);
                continue;
            }
        }

        // Because x[m[j]] < x[m[j + 1]] for all 'j', we can binary search for the longest increasing
        // subsequence that terminates with a value of 'x[k < i]' less than x[i] (if any).
        let lo = 0;
        {
            let hi = m.length - 1;
            while (lo < hi) {
                // eslint-disable-next-line no-bitwise
                const mid = (lo + hi) >>> 1;
                if (x[m[mid]] < x[i]) {
                    lo = mid + 1;
                } else {
                    hi = mid;
                }
            }
        }

        // After searching, x[i] is known to extend the increasing sequence terminating with x[m[lo - 1]].
        // If we this is the first subsequence of length 'lo', or if the previously found subsequence of
        // length 'lo' terminated with a higher value of x[m[lo]], record the new subsequence.
        if (x[i] < x[m[lo]]) {
            // Avoid setting p[i] / accessing 'm[-1]' when 'lo === 0' (severe performance penalty).
            if (lo) {
                p[i] = m[lo - 1];
            }
            m[lo] = i;
        }
    }

    // Reconstruct the longest increasing subsequence.  Our 'm' array is conveniently the length of the
    // longest increasing subsequence found, and (once we load the tail of the list from 'x[m[m.length]]')
    // is no longer used.
    for (let j = m.length, mj = m[j - 1]; j--; mj = p[mj]) {
        m[j] = x[mj];
    }

    return m;
}
