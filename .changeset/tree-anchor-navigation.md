---
"@fluidframework/tree": minor
"fluid-framework": minor
"__section": tree
---
Improve performance of SharedTree reads and parent queries

SharedTree reads and parent/key queries have lower overhead, particularly on hydrated trees.
Map and record reads allocate less memory, and edits no longer cause cached empty entries to accumulate.
These optimizations require no application code changes.

Benchmarks comparing performance before and after these optimizations measured the following reductions in elapsed time on hydrated trees nested ten levels deep:

| Forest | Workload | Before (microseconds/iteration) | After (microseconds/iteration) | Less elapsed time |
| --- | --- | --- | --- | --- |
| ChunkedForest | Object and array reads | 3.47 | 1.63 | 53% |
| ObjectForest | Object and array reads | 4.17 | 1.27 | 69% |
| ChunkedForest | Parent and key queries | 7.32 | 0.71 | 90% |
| ObjectForest | Parent and key queries | 10.49 | 0.72 | 93% |

Measurements used Node.js 22.22.3 on Linux with production emulation enabled and the same benchmark suite before and after this change.
Times are means from four fresh processes per version, run serially in balanced order.
The host was shared, so process-to-process variation can include interference from other workloads.
These are workload-specific results, not whole-application speedups.

#### Full navigation benchmark results

The navigation benchmarks use the same workloads on shallow trees and trees nested ten levels deep.
ChunkedForest and ObjectForest identify hydrated configurations; unhydrated nodes do not use a forest.
Hydrated and unhydrated configurations were measured in separate batches using the same methodology.
Times below are microseconds per benchmark iteration; positive percentages mean less elapsed time.
Each reads iteration includes object-field, optional-field, and array-element access.
Each parent/key iteration queries both the parent and the key.

| Storage | Depth | Workload | Before | After | Less elapsed time |
| --- | --- | --- | --- | --- | --- |
| ChunkedForest | 0 | Reads | 2.134 | 1.331 | 37.6% |
| ChunkedForest | 0 | Edits | 53.946 | 45.095 | 16.4% |
| ChunkedForest | 0 | Parent and key | 3.315 | 0.553 | 83.3% |
| ChunkedForest | 0 | Cached field | 0.384 | 0.013 | 96.6% |
| ChunkedForest | 10 | Reads | 3.467 | 1.630 | 53.0% |
| ChunkedForest | 10 | Edits | 98.991 | 82.181 | 17.0% |
| ChunkedForest | 10 | Parent and key | 7.325 | 0.706 | 90.4% |
| ChunkedForest | 10 | Cached field | 0.761 | 0.013 | 98.3% |
| ObjectForest | 0 | Reads | 2.213 | 1.314 | 40.6% |
| ObjectForest | 0 | Edits | 74.603 | 65.658 | 12.0% |
| ObjectForest | 0 | Parent and key | 4.012 | 0.639 | 84.1% |
| ObjectForest | 0 | Cached field | 0.460 | 0.013 | 97.1% |
| ObjectForest | 10 | Reads | 4.174 | 1.274 | 69.5% |
| ObjectForest | 10 | Edits | 132.465 | 109.229 | 17.5% |
| ObjectForest | 10 | Parent and key | 10.495 | 0.716 | 93.2% |
| ObjectForest | 10 | Cached field | 1.335 | 0.013 | 99.0% |
| Unhydrated | 0 | Reads | 0.444 | 0.427 | 3.8% |
| Unhydrated | 0 | Edits | 1.664 | 1.643 | 1.3% |
| Unhydrated | 0 | Parent and key | 0.415 | 0.389 | 6.2% |
| Unhydrated | 0 | Cached field | 0.017 | 0.010 | 44.1% |
| Unhydrated | 10 | Reads | 0.458 | 0.460 | -0.5% |
| Unhydrated | 10 | Edits | 2.200 | 2.193 | 0.3% |
| Unhydrated | 10 | Parent and key | 0.467 | 0.464 | 0.7% |
| Unhydrated | 10 | Cached field | 0.017 | 0.010 | 43.7% |

The cached-field case measures a single internal lookup, not a complete read or edit.
The other cases use the public tree API; read and query timings also include assertions.
Hydrated edit means improve by 12.0-17.5%, with non-overlapping process ranges.
Their within-process relative margins of error reach 11%, so treat the smaller edit differences with caution.
Unhydrated cached-field lookup improves, but the other unhydrated navigation cases have overlapping process ranges and mixed results across processes.
Unhydrated edits exclude collaboration and undo-history overhead, so their absolute times are not directly comparable with hydrated edits.

#### Text workload results

The text benchmarks measure full-document reads, typing one character in the middle, construction followed by a full read, and formatting the whole document.
They use the same measurement methodology as the navigation benchmarks.
Read, typing, and formatting timings exclude document construction.
The construction workload includes hydration for the forest-backed configurations and leaves nodes unhydrated for the unhydrated configuration.

Times below are milliseconds per operation, shown as the mean followed by the minimum and maximum process means in parentheses.
All results use four fresh processes per version.
Positive percentages mean less elapsed time; negative percentages mean more elapsed time.

| Text | Storage | Workload | Characters | Before (process range) | After (process range) | Less elapsed time |
| --- | --- | --- | --- | --- | --- | --- |
| Plain | ChunkedForest | Full read | 1,000 | 0.0631 (0.0603-0.0664) | 0.0593 (0.0581-0.0622) | 5.9% |
| Plain | ChunkedForest | Type one character | 1,000 | 0.0860 (0.0833-0.0878) | 0.0765 (0.0762-0.0768) | 11.2% |
| Plain | ChunkedForest | Construct and read | 1,000 | 3.0224 (2.8941-3.2428) | 3.1338 (3.0080-3.2702) | -3.7% |
| Plain | ObjectForest | Full read | 1,000 | 0.0747 (0.0735-0.0761) | 0.0848 (0.0715-0.1216) | -13.5% |
| Plain | ObjectForest | Type one character | 1,000 | 0.0912 (0.0892-0.0950) | 0.0821 (0.0812-0.0838) | 9.9% |
| Plain | ObjectForest | Construct and read | 1,000 | 3.9504 (3.8819-4.0276) | 4.0327 (3.8796-4.1933) | -2.1% |
| Plain | Unhydrated | Full read | 1,000 | 0.1040 (0.1015-0.1058) | 0.1028 (0.1013-0.1045) | 1.2% |
| Plain | Unhydrated | Type one character | 1,000 | 0.0367 (0.0363-0.0373) | 0.0362 (0.0356-0.0369) | 1.2% |
| Plain | Unhydrated | Construct and read | 1,000 | 2.1092 (2.0701-2.1690) | 1.9964 (1.9135-2.0706) | 5.3% |
| Formatted | ChunkedForest | Full read | 1,000 | 0.7390 (0.7239-0.7734) | 0.7321 (0.6922-0.7864) | 0.9% |
| Formatted | ChunkedForest | Type one character | 1,000 | 0.1847 (0.1805-0.1883) | 0.1824 (0.1786-0.1869) | 1.2% |
| Formatted | ChunkedForest | Format whole document | 1,000 | 157.9165 (155.5502-159.9662) | 136.3135 (132.9020-139.8259) | 13.7% |
| Formatted | ChunkedForest | Format whole document | 10,000 | 3814.8826 (3749.9555-3869.3860) | 3088.8501 (3026.2318-3216.6462) | 19.0% |
| Formatted | ChunkedForest | Construct and read | 1,000 | 88.0815 (84.3837-92.7805) | 90.3042 (86.1024-93.2478) | -2.5% |
| Formatted | ObjectForest | Full read | 1,000 | 0.6156 (0.6076-0.6261) | 0.7752 (0.5769-1.2672) | -25.9% |
| Formatted | ObjectForest | Type one character | 1,000 | 0.2052 (0.1994-0.2115) | 0.1908 (0.1857-0.1927) | 7.0% |
| Formatted | ObjectForest | Format whole document | 1,000 | 147.1613 (143.7131-150.4535) | 132.6405 (128.3584-135.3011) | 9.9% |
| Formatted | ObjectForest | Format whole document | 10,000 | 1728.2291 (1646.4976-1807.1941) | 1517.7260 (1480.6734-1594.7346) | 12.2% |
| Formatted | ObjectForest | Construct and read | 1,000 | 87.8755 (83.1053-93.8168) | 84.8979 (79.6090-88.7947) | 3.4% |
| Formatted | Unhydrated | Full read | 1,000 | 1.0398 (1.0319-1.0487) | 1.0136 (0.9981-1.0449) | 2.5% |
| Formatted | Unhydrated | Type one character | 1,000 | 0.0650 (0.0636-0.0661) | 0.0643 (0.0630-0.0654) | 1.1% |
| Formatted | Unhydrated | Format whole document | 1,000 | 4.3757 (4.1479-4.5168) | 4.5176 (4.4506-4.6159) | -3.2% |
| Formatted | Unhydrated | Format whole document | 10,000 | 63.7195 (61.5010-66.3731) | 61.5411 (57.8267-64.4749) | 3.4% |
| Formatted | Unhydrated | Construct and read | 1,000 | 28.6373 (25.2443-30.6000) | 30.0071 (28.9476-32.6257) | -4.8% |

For hydrated documents, plain-text typing means improve by 9.9-11.2%, and whole-document formatting means improve by 9.9-19.0%, with non-overlapping process ranges in these cases.
Construction and full-read process ranges overlap in every configuration, so these measurements do not establish consistent improvements or regressions for those workloads.
The slower ObjectForest full-read means are dominated by one of the four after-change processes.
The 10,000-character ObjectForest formatting case has a within-process relative margin of error as high as 19%; its mean improvement should not be read as a precise guarantee.

All unhydrated text process ranges overlap.
The results include slower formatting at 1,000 characters in all four paired comparisons, while formatted construction and formatting at 10,000 characters have mixed results across processes.
These observations should not be read as precise or general speedups or regressions.
These workload-specific measurements do not rule out regressions in these or unmeasured workloads.
