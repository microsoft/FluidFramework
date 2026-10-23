---
"@fluidframework/tree": minor
"fluid-framework": minor
"__section": tree
---
Improve performance of SharedTree reads and parent queries

Map and record reads now access field content without allocating field wrappers or boxing leaf nodes.
Their caches no longer retain empty fields after edits, including merged changes and undo.
Retained internal field references remain usable after cache eviction.
Constructing leaf nodes also avoids map-field schema classification.
Unhydrated maps and records use specialized node and field implementations, keeping empty-field reclamation and retained-reference redirection off fixed-field read paths.

The measurements below compare the original baseline with the map and record cache implementation before the leaf-construction fast path and storage specialization.
Both versions were remeasured for these tables.

SharedTree navigation benchmarks on trees nested ten levels deep measured these reductions in elapsed time:

| Forest | Workload | Before (microseconds/iteration) | After (microseconds/iteration) | Less elapsed time |
| --- | --- | --- | --- | --- |
| ChunkedForest | Object and array reads | 3.74 | 1.68 | 55% |
| ObjectForest | Object and array reads | 5.19 | 1.48 | 72% |
| ChunkedForest | Parent and key queries | 7.62 | 0.74 | 90% |
| ObjectForest | Parent and key queries | 13.06 | 0.69 | 95% |

Measurements used Node.js 22.22.3 on Linux with production emulation enabled and the same benchmark suite before and after this change.
Times are means from four fresh processes per version, run serially in balanced order.
These are workload-specific results, not whole-application speedups.

#### Full navigation benchmark results

The complete navigation suite includes shallow trees as well as trees nested ten levels deep.
Times below are microseconds per benchmark iteration; positive percentages mean less elapsed time.
Each reads iteration includes object-field, optional-field, and array-element access.
Each parent/key iteration queries both the parent and the key.

| Forest | Depth | Workload | Before | After | Less elapsed time |
| --- | --- | --- | --- | --- | --- |
| ChunkedForest | 0 | Reads | 2.247 | 1.351 | 39.9% |
| ChunkedForest | 0 | Edits | 41.740 | 36.262 | 13.1% |
| ChunkedForest | 0 | Parent and key | 3.408 | 0.584 | 82.9% |
| ChunkedForest | 0 | Cached field | 0.342 | 0.020 | 94.2% |
| ChunkedForest | 10 | Reads | 3.738 | 1.676 | 55.2% |
| ChunkedForest | 10 | Edits | 84.801 | 71.037 | 16.2% |
| ChunkedForest | 10 | Parent and key | 7.623 | 0.743 | 90.2% |
| ChunkedForest | 10 | Cached field | 0.819 | 0.020 | 97.6% |
| ObjectForest | 0 | Reads | 2.598 | 1.459 | 43.8% |
| ObjectForest | 0 | Edits | 61.510 | 54.482 | 11.4% |
| ObjectForest | 0 | Parent and key | 4.759 | 0.697 | 85.4% |
| ObjectForest | 0 | Cached field | 0.453 | 0.020 | 95.7% |
| ObjectForest | 10 | Reads | 5.192 | 1.475 | 71.6% |
| ObjectForest | 10 | Edits | 112.775 | 105.547 | 6.4% |
| ObjectForest | 10 | Parent and key | 13.059 | 0.686 | 94.7% |
| ObjectForest | 10 | Cached field | 1.658 | 0.020 | 98.8% |

The cached-field case measures a single internal lookup, not a complete read or edit.
The other cases use the public tree API; read and query timings also include assertions.
Edit measurements are noisier: the benchmark reporter's within-process relative margins of error reach 32%, so treat the smaller edit differences with caution.
The depth-ten ObjectForest edit process ranges overlap.

#### Text workload results

Existing text benchmarks measure full-document reads, typing one character in the middle, document construction followed by a full read, and formatting the whole document.
These comparisons use the same Node.js version, production emulation, and serial balanced process order as the navigation measurements.
The benchmark code is identical before and after.

Times below are milliseconds per operation, shown as the mean followed by the minimum and maximum process means in parentheses.
All results use four fresh processes per version.
Positive percentages mean less elapsed time; negative percentages mean more elapsed time.

| Text | Forest | Workload | Characters | Before (process range) | After (process range) | Less elapsed time |
| --- | --- | --- | --- | --- | --- | --- |
| Plain | ChunkedForest | Full read | 1,000 | 0.0651 (0.0626-0.0687) | 0.0649 (0.0614-0.0689) | 0.2% |
| Plain | ChunkedForest | Type one character | 1,000 | 0.0691 (0.0678-0.0705) | 0.0612 (0.0590-0.0655) | 11.5% |
| Plain | ChunkedForest | Construct and read | 1,000 | 3.0624 (3.0116-3.1069) | 3.0956 (2.9097-3.3398) | -1.1% |
| Plain | ObjectForest | Full read | 1,000 | 0.0818 (0.0786-0.0858) | 0.0745 (0.0731-0.0765) | 9.0% |
| Plain | ObjectForest | Type one character | 1,000 | 0.0699 (0.0682-0.0733) | 0.0633 (0.0620-0.0646) | 9.3% |
| Plain | ObjectForest | Construct and read | 1,000 | 3.8904 (3.7775-4.0446) | 4.0076 (3.9211-4.1962) | -3.0% |
| Formatted | ChunkedForest | Full read | 1,000 | 0.7126 (0.7005-0.7310) | 0.6786 (0.6589-0.7082) | 4.8% |
| Formatted | ChunkedForest | Type one character | 1,000 | 0.1515 (0.1459-0.1560) | 0.1381 (0.1336-0.1410) | 8.8% |
| Formatted | ChunkedForest | Format whole document | 1,000 | 141.5994 (138.0538-144.4439) | 119.5552 (117.4117-121.9373) | 15.6% |
| Formatted | ChunkedForest | Format whole document | 10,000 | 3953.7099 (3852.0217-4060.9129) | 3068.4357 (3002.8149-3144.9934) | 22.4% |
| Formatted | ChunkedForest | Construct and read | 1,000 | 83.8835 (83.2398-84.8398) | 86.7038 (85.1941-88.2193) | -3.4% |
| Formatted | ObjectForest | Full read | 1,000 | 0.6195 (0.6073-0.6344) | 0.5778 (0.5728-0.5841) | 6.7% |
| Formatted | ObjectForest | Type one character | 1,000 | 0.1666 (0.1604-0.1712) | 0.1569 (0.1544-0.1595) | 5.8% |
| Formatted | ObjectForest | Format whole document | 1,000 | 130.5154 (127.6720-135.3707) | 117.7196 (112.3018-123.6897) | 9.8% |
| Formatted | ObjectForest | Format whole document | 10,000 | 1623.9455 (1622.4425-1626.3980) | 1369.9495 (1354.3182-1411.0859) | 15.6% |
| Formatted | ObjectForest | Construct and read | 1,000 | 83.0416 (82.4684-83.5278) | 84.9853 (83.9635-86.2251) | -2.3% |

Typing means improve by 5.8-11.5%, and whole-document formatting means improve by 9.8-22.4% in these cases.
Formatted-text construction means are 2.3-3.4% slower, with non-overlapping process ranges and slower results in all four balanced pairs for each forest.
Plain-text construction means are 1.1-3.0% slower, but their process ranges overlap.
The text read differences are also small relative to process variation in some cases.
The 10,000-character ObjectForest formatting case has a within-process relative margin of error as high as 29%; its mean improvement should not be read as a precise guarantee.
These measurements show a small formatted-text construction regression in this batch and cannot rule out regressions in unmeasured workloads.
