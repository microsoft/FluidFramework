# SharedTree history compaction findings

SharedTree history compaction was measured on both an **interactive client and a dedicated summarizer**, using Tinylicious.

The workload starts with **10,000 rows and 1,000 value replacements**, with `retainHistory: true`.
It compares two metadata variants: no customer metadata, and a 256-byte note plus operation, edit-index, and row-ID fields per edit.

## How compaction works

After service acknowledgments make the edits eligible, the benchmark explicitly divides the 1,000 workload commits into **10 groups of 100**.
Adjacent commits are combined in balanced rounds until each group has one surviving commit.
This requires **990 pair combinations**.
Initialization and acknowledgment commits remain untouched, reducing retained commits from **1,002 to 12**.
Compaction runs independently on the interactive client and summarizer; it is not broadcast or automatically triggered.

> **Tinylicious provides the Fluid service; it does not perform compaction.**
> It sequences and distributes edits, supplies collaboration sequence information used to determine eligibility, and stores and serves the summarizer's uploaded summaries.
> SharedTree performs compaction inside each client through explicit calls to `compactHistory(older, newer)`, without sending a compaction operation to the service.
> This is client-side compaction tested against a Tinylicious-backed collaboration and summary-storage environment, not server-side compaction.

## Results

| Customer metadata | Location | Before MB | After MB | Savings | Compaction time |
| --- | --- | ---: | ---: | ---: | ---: |
| None | Interactive client | 3.874859 | 3.293275 | 15.01% | 97.082 ms |
| None | Summarizer | 3.875033 | 3.293449 | 15.01% | 98.975 ms |
| 256-byte note + edit fields | Interactive client | 4.220431 | 3.629937 | 13.99% | 77.405 ms |
| 256-byte note + edit fields | Summarizer | 4.220605 | 3.630111 | 13.99% | 87.432 ms |
