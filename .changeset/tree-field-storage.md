---
"@fluidframework/tree": minor
"fluid-framework": minor
"__section": tree
---
Reduce memory overhead for SharedTree maps and records

Maps retain less memory after reads of missing keys, and maps and records no longer retain empty fields after key churn.
These improvements require no application code changes.

#### Retained-memory measurements

Reading 10,000 distinct missing map keys reduces the measured increase in retained heap by approximately 99% in these cases.
Setting and deleting 10,000 distinct keys on unhydrated maps and records reduces the measured increase by approximately 92%.
These percentages describe the additional heap retained by these workloads, not the memory used by an entire document or application.
Heap measurements use mebibytes (MiB, 1,048,576 bytes).

| Storage | Workload | Before (MiB) | After (MiB) | Less additional retained heap |
| --- | --- | --- | --- | --- |
| ChunkedForest | Map: read missing keys | 10.777 | 0.114 | 98.9% |
| ObjectForest | Map: read missing keys | 10.507 | 0.157 | 98.5% |
| Unhydrated | Map: read missing keys | 3.120 | 0.036 | 98.9% |
| Unhydrated | Map: set and delete keys | 3.233 | 0.267 | 91.7% |
| Unhydrated | Record: set and delete keys | 3.229 | 0.255 | 92.1% |

Each row is the mean of four fresh processes per version, with the document retained and garbage collection requested before and after the workload.
Missing-key record reads already have low retained-memory growth before this change and are not included as a memory improvement.
The key-churn memory cases are unhydrated to exclude collaborative edit-history retention.
This measures retained heap, not total allocation or peak memory.

#### Timing methodology

The following comparisons isolate the remaining map/record changes: the baseline already includes the previously released navigation optimizations.
Both versions use identical benchmark code, Node.js 22.22.3 on Linux x64, and production emulation.
ChunkedForest is the optimized hydrated storage, ObjectForest is the reference hydrated storage, and unhydrated trees have not been inserted into a SharedTree view.
Four fresh processes per version run serially in balanced order: baseline, updated, updated, baseline, updated, baseline, baseline, updated.
The host is shared, and there is substantial process-to-process variation.
Percentages use unrounded process means; positive percentages mean less elapsed time, and negative percentages mean more elapsed time.
Results are workload-specific measurements, not whole-application speedups.

#### Map and record timings

These are the most directly affected cases.
Times are microseconds per benchmark iteration, shown as the mean followed by the minimum and maximum process means in parentheses.
Key churn sets, reads, deletes, and rereads a key; document rebuilding is outside the timed region.

| Storage | Workload | Before (process range) | After (process range) | Less elapsed time |
| --- | --- | --- | --- | --- |
| ChunkedForest | Map Read leaf | 2.300 (1.848-2.805) | 2.540 (2.273-3.273) | -10.4% |
| ChunkedForest | Map Read missing | 0.901 (0.660-1.145) | 0.935 (0.735-1.253) | -3.8% |
| ChunkedForest | Map Key churn | 136.038 (111.253-159.914) | 139.818 (111.429-165.905) | -2.8% |
| ChunkedForest | Record Read leaf | 2.661 (2.267-3.735) | 2.961 (2.636-3.217) | -11.3% |
| ChunkedForest | Record Read missing | 1.254 (0.944-1.439) | 1.263 (0.956-1.400) | -0.7% |
| ChunkedForest | Record Key churn | 142.874 (110.664-159.649) | 141.585 (125.119-161.846) | +0.9% |
| ObjectForest | Map Read leaf | 1.223 (1.084-1.580) | 1.458 (1.234-1.676) | -19.2% |
| ObjectForest | Map Read missing | 0.816 (0.603-1.023) | 0.913 (0.648-1.109) | -11.9% |
| ObjectForest | Map Key churn | 186.235 (162.501-220.988) | 195.627 (183.127-212.194) | -5.0% |
| ObjectForest | Record Read leaf | 2.244 (2.021-2.374) | 2.335 (1.165-4.134) | -4.0% |
| ObjectForest | Record Read missing | 1.193 (1.103-1.293) | 1.073 (0.912-1.172) | +10.1% |
| ObjectForest | Record Key churn | 191.767 (172.145-212.150) | 209.628 (186.903-225.990) | -9.3% |
| Unhydrated | Map Read leaf | 0.601 (0.517-0.710) | 0.504 (0.459-0.540) | +16.1% |
| Unhydrated | Map Read missing | 0.580 (0.473-0.642) | 0.339 (0.255-0.451) | +41.5% |
| Unhydrated | Map Key churn | 9.473 (7.816-11.096) | 8.709 (5.888-10.074) | +8.1% |
| Unhydrated | Record Read leaf | 0.674 (0.557-0.769) | 0.596 (0.390-0.747) | +11.5% |
| Unhydrated | Record Read missing | 0.515 (0.361-0.646) | 0.470 (0.353-0.634) | +8.7% |
| Unhydrated | Record Key churn | 10.690 (7.784-11.804) | 9.934 (7.251-12.775) | +7.1% |

Unhydrated missing-map-key reads improve by 41.5%, with non-overlapping process ranges.
Other dynamic-field timing ranges overlap, including every hydrated case.
Several hydrated means are slower, including 19.2% more time for ObjectForest map leaf reads; these results do not establish an across-the-board read or edit speedup.
Overlapping ranges do not prove equivalence or rule out regressions.

#### Object and array navigation controls

The rest of the navigation suite checks workloads that benefited from the earlier navigation change.
Times below are mean microseconds per iteration.
Read iterations include object-field, optional-field, and array-element access; parent/key iterations query both the parent and key.
Cached-field cases measure an internal lookup, not a complete application read or edit.

| Storage | Workload | Before | After | Less elapsed time |
| --- | --- | --- | --- | --- |
| ChunkedForest | depth 0 reads | 2.502 | 2.430 | +2.9% |
| ChunkedForest | depth 0 edits | 69.640 | 73.653 | -5.8% |
| ChunkedForest | depth 0 parent and key | 0.941 | 0.755 | +19.8% |
| ChunkedForest | depth 0 cached field | 0.033 | 0.024 | +26.9% |
| ChunkedForest | depth 10 reads | 2.840 | 2.656 | +6.5% |
| ChunkedForest | depth 10 edits | 128.281 | 135.105 | -5.3% |
| ChunkedForest | depth 10 parent and key | 1.031 | 0.945 | +8.3% |
| ChunkedForest | depth 10 cached field | 0.027 | 0.022 | +16.4% |
| ObjectForest | depth 0 reads | 2.227 | 2.347 | -5.4% |
| ObjectForest | depth 0 edits | 113.778 | 109.082 | +4.1% |
| ObjectForest | depth 0 parent and key | 1.108 | 0.880 | +20.6% |
| ObjectForest | depth 0 cached field | 0.042 | 0.035 | +15.4% |
| ObjectForest | depth 10 reads | 2.267 | 2.299 | -1.4% |
| ObjectForest | depth 10 edits | 178.235 | 169.527 | +4.9% |
| ObjectForest | depth 10 parent and key | 1.162 | 1.019 | +12.3% |
| ObjectForest | depth 10 cached field | 0.037 | 0.030 | +17.3% |
| Unhydrated | depth 0 reads | 0.824 | 0.750 | +9.0% |
| Unhydrated | depth 0 edits | 2.705 | 2.991 | -10.5% |
| Unhydrated | depth 0 parent and key | 0.784 | 0.819 | -4.6% |
| Unhydrated | depth 0 cached field | 0.039 | 0.025 | +35.5% |
| Unhydrated | depth 10 reads | 0.781 | 0.976 | -24.9% |
| Unhydrated | depth 10 edits | 3.450 | 3.426 | +0.7% |
| Unhydrated | depth 10 parent and key | 0.836 | 0.646 | +22.8% |
| Unhydrated | depth 10 cached field | 0.043 | 0.027 | +37.7% |

Read and edit process ranges overlap in every storage/depth configuration.
These controls therefore do not establish repeatable read or edit improvements or prove absence of regressions.
Edit measurements have within-process relative margins of error up to approximately 15.3%.

#### Text workload controls

Existing text benchmarks cover full-document reads, single-character insertion, construction followed by a full read, and whole-document formatting.
Read, insertion, and formatting timings exclude document construction.
Times are milliseconds per operation, shown as the mean followed by the minimum and maximum process means in parentheses.

| Text | Storage | Workload | Characters | Before (process range) | After (process range) | Less elapsed time |
| --- | --- | --- | --- | --- | --- | --- |
| Plain | Unhydrated | Full read | 1,000 | 0.153 (0.133-0.168) | 0.159 (0.141-0.174) | -3.7% |
| Plain | Unhydrated | Type one character | 1,000 | 0.054 (0.051-0.055) | 0.057 (0.053-0.061) | -6.2% |
| Plain | Unhydrated | Construct and read | 1,000 | 3.106 (2.794-3.392) | 2.996 (2.753-3.155) | +3.5% |
| Plain | ChunkedForest | Full read | 1,000 | 0.095 (0.073-0.114) | 0.110 (0.094-0.117) | -15.6% |
| Plain | ChunkedForest | Type one character | 1,000 | 0.098 (0.093-0.107) | 0.098 (0.094-0.103) | -0.4% |
| Plain | ChunkedForest | Construct and read | 1,000 | 4.624 (4.443-4.752) | 4.439 (4.289-4.564) | +4.0% |
| Plain | ObjectForest | Full read | 1,000 | 0.096 (0.081-0.111) | 0.099 (0.082-0.108) | -2.9% |
| Plain | ObjectForest | Type one character | 1,000 | 0.116 (0.110-0.127) | 0.127 (0.125-0.129) | -9.6% |
| Plain | ObjectForest | Construct and read | 1,000 | 5.817 (5.444-6.043) | 5.841 (5.585-6.525) | -0.4% |
| Formatted | Unhydrated | Full read | 1,000 | 1.683 (1.539-1.768) | 1.606 (1.395-1.837) | +4.6% |
| Formatted | Unhydrated | Type one character | 1,000 | 0.105 (0.096-0.111) | 0.094 (0.085-0.103) | +10.6% |
| Formatted | Unhydrated | Format whole document | 1,000 | 6.111 (5.753-6.741) | 5.973 (5.508-6.342) | +2.3% |
| Formatted | Unhydrated | Format whole document | 10,000 | 83.857 (79.616-88.545) | 82.696 (72.325-93.416) | +1.4% |
| Formatted | Unhydrated | Construct and read | 1,000 | 44.787 (40.179-48.047) | 46.609 (41.721-52.313) | -4.1% |
| Formatted | ChunkedForest | Full read | 1,000 | 1.147 (1.004-1.377) | 1.067 (1.001-1.127) | +6.9% |
| Formatted | ChunkedForest | Type one character | 1,000 | 0.244 (0.227-0.275) | 0.247 (0.231-0.262) | -1.1% |
| Formatted | ChunkedForest | Format whole document | 1,000 | 186.841 (163.652-200.178) | 181.408 (159.662-193.959) | +2.9% |
| Formatted | ChunkedForest | Format whole document | 10,000 | 3789.390 (3660.981-3861.844) | 3831.076 (3725.428-3950.953) | -1.1% |
| Formatted | ChunkedForest | Construct and read | 1,000 | 137.910 (135.203-140.507) | 138.613 (133.541-142.854) | -0.5% |
| Formatted | ObjectForest | Full read | 1,000 | 0.824 (0.778-0.903) | 0.907 (0.836-0.983) | -10.1% |
| Formatted | ObjectForest | Type one character | 1,000 | 0.275 (0.246-0.299) | 0.284 (0.275-0.301) | -3.3% |
| Formatted | ObjectForest | Format whole document | 1,000 | 180.846 (168.469-198.783) | 189.447 (181.661-203.163) | -4.8% |
| Formatted | ObjectForest | Format whole document | 10,000 | 1872.593 (1766.931-1976.506) | 1860.474 (1809.988-1972.896) | +0.6% |
| Formatted | ObjectForest | Construct and read | 1,000 | 129.996 (121.841-142.746) | 126.954 (120.008-131.488) | +2.3% |

Every text workload has overlapping process ranges.
Some means are slower, including plain-text reads on ChunkedForest and formatted-text reads on ObjectForest.
These measurements do not establish a general text speedup or prove that text workloads cannot regress.
The slowest formatting cases have within-process relative margins of error as high as approximately 47%, so their small mean differences are inconclusive.
