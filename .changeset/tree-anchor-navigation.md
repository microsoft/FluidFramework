---
"@fluidframework/tree": minor
"fluid-framework": minor
"__section": tree
---
Improve performance of SharedTree reads and parent queries

SharedTree navigation benchmarks on trees nested ten levels deep measured these reductions in elapsed time:

| Forest | Workload | Before (microseconds/iteration) | After (microseconds/iteration) | Less elapsed time |
| --- | --- | --- | --- | --- |
| ChunkedForest | Object and array reads | 3.65 | 1.65 | 55% |
| ObjectForest | Object and array reads | 5.02 | 1.43 | 72% |
| ChunkedForest | Parent and key queries | 7.54 | 0.70 | 91% |
| ObjectForest | Parent and key queries | 12.79 | 0.78 | 94% |

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
| ChunkedForest | 0 | Reads | 2.159 | 1.305 | 39.5% |
| ChunkedForest | 0 | Edits | 42.312 | 34.682 | 18.0% |
| ChunkedForest | 0 | Parent and key | 3.336 | 0.593 | 82.2% |
| ChunkedForest | 0 | Cached field | 0.359 | 0.019 | 94.6% |
| ChunkedForest | 10 | Reads | 3.648 | 1.654 | 54.7% |
| ChunkedForest | 10 | Edits | 84.226 | 69.689 | 17.3% |
| ChunkedForest | 10 | Parent and key | 7.542 | 0.705 | 90.7% |
| ChunkedForest | 10 | Cached field | 0.800 | 0.020 | 97.5% |
| ObjectForest | 0 | Reads | 2.579 | 1.465 | 43.2% |
| ObjectForest | 0 | Edits | 61.750 | 54.089 | 12.4% |
| ObjectForest | 0 | Parent and key | 4.545 | 0.704 | 84.5% |
| ObjectForest | 0 | Cached field | 0.456 | 0.020 | 95.7% |
| ObjectForest | 10 | Reads | 5.025 | 1.429 | 71.6% |
| ObjectForest | 10 | Edits | 113.000 | 107.442 | 4.9% |
| ObjectForest | 10 | Parent and key | 12.793 | 0.777 | 93.9% |
| ObjectForest | 10 | Cached field | 1.622 | 0.020 | 98.8% |

The cached-field case measures a single internal lookup, not a complete read or edit.
The other cases use the public tree API; read and query timings also include assertions.
Edit measurements are noisier: the benchmark reporter's within-process relative margins of error reach 31%, so the smaller edit differences are not evidence of a reliable speedup.

#### Text workload results

Existing text benchmarks measure full-document reads, typing one character in the middle, document construction followed by a full read, and formatting the whole document.
These comparisons use the same Node.js version, production emulation, and serial balanced process order as the navigation measurements.
The benchmark code is identical before and after.

Times below are milliseconds per operation, shown as the mean followed by the minimum and maximum process means in parentheses.
Read, typing, and formatting results use four processes per version.
Construction results combine the initial four processes with a separate balanced four-process confirmation per version.
Positive percentages mean less elapsed time; negative percentages mean more elapsed time.

| Text | Forest | Workload | Characters | Before (process range) | After (process range) | Less elapsed time |
| --- | --- | --- | --- | --- | --- | --- |
| Plain | ChunkedForest | Full read | 1,000 | 0.0685 (0.0677-0.0697) | 0.0652 (0.0610-0.0667) | 4.8% |
| Plain | ChunkedForest | Type one character | 1,000 | 0.0691 (0.0674-0.0708) | 0.0614 (0.0602-0.0642) | 11.2% |
| Plain | ChunkedForest | Construct and read | 1,000 | 3.2045 (3.0209-3.3270) | 3.1894 (3.0088-3.3745) | 0.5% |
| Plain | ObjectForest | Full read | 1,000 | 0.0788 (0.0755-0.0825) | 0.0751 (0.0732-0.0760) | 4.8% |
| Plain | ObjectForest | Type one character | 1,000 | 0.0713 (0.0693-0.0756) | 0.0643 (0.0629-0.0654) | 9.9% |
| Plain | ObjectForest | Construct and read | 1,000 | 3.9352 (3.7171-4.2452) | 3.8683 (3.7935-3.9356) | 1.7% |
| Formatted | ChunkedForest | Full read | 1,000 | 0.6959 (0.6735-0.7206) | 0.6695 (0.6427-0.6821) | 3.8% |
| Formatted | ChunkedForest | Type one character | 1,000 | 0.1508 (0.1445-0.1580) | 0.1412 (0.1385-0.1438) | 6.4% |
| Formatted | ChunkedForest | Format whole document | 1,000 | 139.7725 (136.6959-142.5640) | 120.1625 (117.7091-123.4721) | 14.0% |
| Formatted | ChunkedForest | Format whole document | 10,000 | 4038.4367 (3910.7068-4148.2866) | 3079.5698 (2974.1198-3172.8990) | 23.7% |
| Formatted | ChunkedForest | Construct and read | 1,000 | 81.1746 (75.8017-85.0744) | 81.5315 (75.2357-91.1792) | -0.4% |
| Formatted | ObjectForest | Full read | 1,000 | 0.6035 (0.5832-0.6141) | 0.5941 (0.5659-0.6119) | 1.6% |
| Formatted | ObjectForest | Type one character | 1,000 | 0.1675 (0.1668-0.1678) | 0.1584 (0.1525-0.1625) | 5.4% |
| Formatted | ObjectForest | Format whole document | 1,000 | 126.8660 (126.0105-127.5531) | 114.0604 (112.6558-116.6398) | 10.1% |
| Formatted | ObjectForest | Format whole document | 10,000 | 1594.1660 (1583.2782-1616.7702) | 1373.0516 (1314.7622-1412.5856) | 13.9% |
| Formatted | ObjectForest | Construct and read | 1,000 | 84.2371 (82.2337-88.1741) | 84.0626 (82.3848-85.9094) | 0.2% |

Typing means improve by 5-11%, and whole-document formatting means improve by 10-24% in these cases.
Construction differences are inconclusive: the initial batch shows 1-4% slower means in three cases, but those cases improve in the confirmation batch, and the combined process ranges overlap.
The text read differences are also small relative to process variation in some cases.
The 10,000-character ObjectForest formatting case has a within-process relative margin of error as high as 33%; its mean improvement should not be read as a precise guarantee.
These measurements do not establish a repeatable construction regression, but they cannot rule out small regressions or regressions in unmeasured workloads.
