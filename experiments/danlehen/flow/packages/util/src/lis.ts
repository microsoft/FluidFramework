/**
 * Returns a longest increasing subsequence of the given array 'x' in O(n log n) time.
 * {@link https://en.wikipedia.org/wiki/Longest_increasing_subsequence}
 */
export function lis(x: number[]): number[] {
    // Avoid returning '[ undefined ]' for an empty sequence.  The 'undefined' happens because we initialize 'm'
    // with '0' and begin with the iteration 'i = 1'.
    if (!x.length) { 
        return x;
    }

    // m[j] stores the index k of the smallest value x[k] such that there is an increasing subsequence of length
    // j ending at X[k] on the range k ≤ i. Note that j ≤ (i+1), because j ≥ 1 represents the length of the increasing
    // subsequence, and k ≥ 0 represents the index of its termination.
    const m = [ 0 ];
    
    // p[k] stores the index of the predecessor of x[k] in the longest increasing subsequence ending at x[k].
    const p = new Array<number>(x.length);

    for (let i = 1; i < x.length; i++) {
        // Test if x[i] can be used to extend the current longest increasing sequence.  If so, we append it
        // to the current longest sequence and continue w/o searching.
        {
            const mLast = m[m.length - 1];
            if (x[mLast] < x[i]) {
                p[i] = mLast;
                m.push(i);
                continue;
            }
        }
 
        // Binary search for the largest positive j ≤ L such that x[m[j]] < x[i] (where L = m.length).
        // After searching, lo is 1 greater than the length of the longest prefix of X[i].
        let lo = 0;
        {
            let hi = m.length - 1;
            while (lo < hi) {
                const mid = (lo + hi) >> 1;
                if (x[m[mid]] < x[i]) {
                    lo = mid + 1;
                } else {
                    hi = mid;
                }
            }
        }
 
        // The predecessor of x[i] is the last index of the subsequence of m[lo].
		if (x[i] < x[m[lo]]) {
            // Avoid setting p[i] / accessing 'm[-1]' when 'lo === 0' (severe performance penalty).
			if (lo) {
                p[i] = m[lo - 1];
            }
			m[lo] = i;
		}
	}
    
    // Reconstruct the longest increasing subsequence.  Our 'm' array is conveniently the correct size
    // and (once we load the tail of the list into 'k') is no longer used.
    for (let l = m.length, k = m[l - 1]; l--; k = p[k]) {
        m[l] = x[k];
    }

    return m;
}
